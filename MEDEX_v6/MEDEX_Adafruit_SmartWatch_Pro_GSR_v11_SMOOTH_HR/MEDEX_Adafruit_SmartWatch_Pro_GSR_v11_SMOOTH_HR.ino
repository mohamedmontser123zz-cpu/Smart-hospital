/*
 * MEDEX SmartWatch Pro v11 — Smooth Adafruit UI + GSR + Robust HR
 * Target : ESP32 + GC9A01A 240x240 Round Display
 *
 * Sensors:
 *   AHT21B   : Temperature + Humidity  I2C 0x38
 *   MAX30102 : Heart Rate + SpO2       I2C 0x57
 *   GSR      : Skin response analog    GPIO34
 *
 * Wiring:
 *   GC9A01A CS  -> GPIO5
 *   GC9A01A DC  -> GPIO27
 *   GC9A01A RST -> GPIO33
 *   GC9A01A SDA -> GPIO22
 *   GC9A01A SCL -> GPIO21
 *
 *   I2C SDA -> GPIO23
 *   I2C SCL -> GPIO18
 *
 *   Button  -> GPIO14 to GND
 *   GSR OUT -> GPIO34
 *   GSR VCC -> 3.3V
 *   GSR GND -> GND
 *
 * UI library: Adafruit_GFX + Adafruit_GC9A01A only. No LVGL.
 *
 * Notes:
 *   - UI v9 improves MAX30102 heart-rate reading:
 *     1) Faster MAX30102 sample rate for pulse detection.
 *     2) Reads all FIFO samples so display redraw does not skip beats.
 *     3) Averages only valid BPM samples, not empty zeros.
 *   - UI v8 fixes the screen problems seen on the real round display:
 *     1) Full clean redraw at a low frame rate to stop pixels stacking.
 *     2) Bigger text and bigger cards for better visibility under the lens.
 *     3) All content is inside the safe round-display area.
 *   - LVGL is not required.
 */

// Uncomment for purple MH-ET LIVE MAX30102 clones with swapped RED/IR.
#define MAX30102_CLONE

#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_GC9A01A.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Adafruit_AHTX0.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>
#include <math.h>
#include <string.h>
#include <esp_sleep.h>

// ─────────────────────────────────────────────────────────────
// Deep Sleep Configuration
// ─────────────────────────────────────────────────────────────
#define DEEP_SLEEP_DURATION_US  (10ULL * 60 * 1000000)  // 10 minutes in µs
#define AWAKE_WINDOW_MS         (5ULL * 60 * 1000000)                     //5 minutes  awake
#define BUTTON_WAKE_PIN         GPIO_NUM_14              // ext0 wake pin

// RTC memory — survives deep sleep
RTC_DATA_ATTR int  bootCount = 0;
RTC_DATA_ATTR bool wasDeepSleep = false;

// ─────────────────────────────────────────────────────────────
// Pins
// ─── PINS ─────────────────────────────────────────────────────
#define TFT_CS   5
#define TFT_DC   27
#define TFT_RST  33
#define TFT_SCK  21     // display moved here (physically rewire SCK to GPIO21)
#define TFT_MOSI 22     // display moved here (physically rewire MOSI to GPIO22)
#define BTN_FACE 14

// I2C stays on 18/23
#define I2C_SDA  23
#define I2C_SCL  18
#define GSR_PIN  34
// ─────────────────────────────────────────────────────────────
// Wi-Fi / NTP
// ─────────────────────────────────────────────────────────────
const char* ssid               = "raspberry";
const char* password           = "12345678";
const char* ntpServer          = "pool.ntp.org";
const long  gmtOffset_sec      = 7200;   // Egypt UTC+2
const int   daylightOffset_sec = 3600;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
IPAddress mqttBrokerIp;
const uint16_t mqttPort = 1883;
unsigned long lastMqttPublish = 0;
const unsigned long MQTT_PUBLISH_MS = 1000;

// ─────────────────────────────────────────────────────────────
// Display
// ─────────────────────────────────────────────────────────────
Adafruit_GC9A01A tft(TFT_CS, TFT_DC, TFT_MOSI, TFT_SCK, TFT_RST);
#define CX 120
#define CY 120
#define PI2 6.28318530718f

// ─────────────────────────────────────────────────────────────
// Colors RGB565
// ─────────────────────────────────────────────────────────────
#define C_BLACK       0x0000
#define C_BG          0x0009
#define C_BG2         0x0012
#define C_PANEL       0x0843
#define C_PANEL2      0x1086
#define C_LINE        0x2A69
#define C_DIM         0x528A
#define C_GRAY        0x7BEF
#define C_WHITE       0xFFFF
#define C_OFFWHITE    0xEF7B
#define C_BLUE        0x041F
#define C_CYAN        0x07FF
#define C_CYAN_DIM    0x03CF
#define C_TEAL        0x0451
#define C_GREEN       0x07E0
#define C_LIME        0xAFE5
#define C_AMBER       0xFD20
#define C_ORANGE      0xFC60
#define C_RED         0xF800
#define C_RED_DIM     0x7800
#define C_VIOLET      0x801F
#define C_MAGENTA     0xF81F

#define MED_ACCENT    0x0673
#define MED_ACCENT2   0x07BF
#define MED_HR        C_RED
#define MED_SPO2      0x07FF
#define MED_TEMP      C_AMBER
#define MED_GSR       0xAFE5
#define MED_HUM       0x4EFF

// ─────────────────────────────────────────────────────────────
// Sensors
// ─────────────────────────────────────────────────────────────
Adafruit_AHTX0 aht;
MAX30105 particleSensor;

bool ahtOK = false;
bool maxOK = false;
bool gsrOK = false;
bool fingerOn = false;

// Health metrics
int   bpm          = 0;
int   spo2         = 0;
float ambientTemp  = 0.0f;
float humidity     = 0.0f;
int   batteryPct   = 85;

// GSR / MEDEX
int   gsrRaw       = 0;
float gsrVoltage   = 0.0f;
float gsrFiltered  = 0.0f;
float gsrBaseline  = 0.0f;
int   gsrDelta     = 0;
int   medexLevel   = 0;     // 0 relaxed, 100 high arousal
bool  gsrContact   = false;

// MAX30102
#define HR_BUF_LEN 6
byte rateBuffer[HR_BUF_LEN];
byte rateIdx = 0;
long lastBeat = 0;
const long IR_FINGER_THRESHOLD = 30000L;

#define SPO2_SAMPLES 50
long redBuf[SPO2_SAMPLES];
long irBuf[SPO2_SAMPLES];
int  spo2BufIdx = 0;
int  spo2Smooth = 0;

// Robust pulse detector. checkForBeat() can miss beats when the display is busy,
// so v11 also uses an adaptive AC-threshold detector.
float ppgDC = 0.0f;
float ppgAC = 0.0f;
float ppgNoise = 0.0f;
bool  ppgHigh = false;
unsigned long lastAdaptiveBeat = 0;
long lastDbgRed = 0;
long lastDbgIr  = 0;
long lastDbgBeatChannel = 0;

// Timing
unsigned long lastAHTread = 0;
const unsigned long AHT_INTERVAL = 3000;

unsigned long lastGSRread = 0;
const unsigned long GSR_INTERVAL = 200;

unsigned long lastSerialGSR = 0;
unsigned long lastSerialMAX = 0;

// Smooth UI refresh: full redraw only on face change, then partial updates.
unsigned long lastUiDraw = 0;
const unsigned long UI_REFRESH_MS = 250;

// UI State
#define FACE_MEDEX       0
#define FACE_VITALS      1
#define FACE_ANALOG_PRO  2
#define FACE_GSR_FOCUS   3
#define FACE_MISSION     4
#define FACE_MINIMAL     5
#define NUM_FACES        6

int currentFace = FACE_MEDEX;
bool needFullRedraw = true;
bool isAsleep = false;
int frame = 0;
int lastSecond = -1;
int lastMinute = -1;

unsigned long lastInteract = 0;
const unsigned long AWAKE_MS = AWAKE_WINDOW_MS;

unsigned long lastBtnPress = 0;
bool lastBtnState = HIGH;

// Animation
#define ECG_LEN 120
int16_t ecgBuf[ECG_LEN];
int ecgIdx = 0;
const int8_t ECG_TEMPLATE[32] = {
   0, 0, 1, 2, 1, 0,-1,-1,
   0,26,-22,16, 4, 2, 0, 0,
   0, 0, 2, 5, 6, 5, 3, 1,
   0, 0, 0, 0, 0, 0, 0, 0
};
float breathPhase = 0.0f;

// Previous values for clean updates
int prevBpm = -999, prevSpo2 = -999, prevBatt = -999;
int prevMedex = -999, prevGsrRaw = -999, prevTempInt = -999, prevHumInt = -999;
int prevSecDotX = -1, prevSecDotY = -1;

// ─────────────────────────────────────────────────────────────
// Forward declarations
// ─────────────────────────────────────────────────────────────
void bootAnimation();
void wifiConnect();
void mqttConnect();
void mqttLoop();
void publishWatchData();
bool initSensors();
void initGSR();
void readAHT21();
void readMAX30102();
bool detectBeatAdaptive(long sample);
void readGSR();
int  calcSpO2(long* red, long* ir, int n);

void drawFace(bool full);
void drawFaceMedex(bool full);
void drawFaceVitals(bool full);
void drawFaceAnalogPro(bool full);
void drawFaceGSRFocus(bool full);
void drawFaceMission(bool full);
void drawFaceMinimal(bool full);

void getWatchTime(struct tm& t);
void handleButton();
void goToDeepSleep();
void wakeUp();

void resetPrev();
void drawHeader(const char* title, uint16_t accent);
void drawFooterDots(int x, int y);
void drawBattery(int x, int y, int pct);
void drawCenteredText(const char* txt, int x, int y, int w, uint16_t color, const GFXfont* font, uint8_t size);
void drawValueBox(int x, int y, int w, int h, const char* label, const char* value, const char* unit, uint16_t accent);
void drawArc(int cx, int cy, int r, float a1, float a2, uint16_t col, int thick);
void drawRingGauge(int cx, int cy, int r, int pct, uint16_t col, uint16_t bg, int thick);
void drawECG(int x0, int y0, int w, int h, uint16_t col, uint16_t bg);
void drawAnalogHands(int hh, int mm, int ss);
void drawHeart(int x, int y, int r, uint16_t color);
void drawInitCard(const char* label, bool ok, int step, int total);

// ─────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  bootCount++;

  // ── Detect wake reason ─────────────────────────────────────
  esp_sleep_wakeup_cause_t wakeReason = esp_sleep_get_wakeup_cause();
  bool wokeByTimer  = (wakeReason == ESP_SLEEP_WAKEUP_TIMER);
  bool wokeByButton = (wakeReason == ESP_SLEEP_WAKEUP_EXT0);
  bool coldBoot     = (wakeReason == ESP_SLEEP_WAKEUP_UNDEFINED);

  Serial.printf("\n=== MEDEX Boot #%d  reason=%d ===", bootCount, (int)wakeReason);
  if (wokeByTimer)  Serial.println(" [TIMER wake — measure & send]");
  else if (wokeByButton) Serial.println(" [BUTTON wake — interactive]");
  else Serial.println(" [COLD boot — first power-on]");

  pinMode(BTN_FACE, INPUT_PULLUP);

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000);

  tft.begin();
  tft.setRotation(2);
  tft.setTextWrap(false);
  tft.fillScreen(C_BLACK);

  for (int i = 0; i < ECG_LEN; i++) ecgBuf[i] = ECG_TEMPLATE[i % 32];

  // On cold boot or button wake: full boot animation + UI
  // On timer wake: skip animation, fast connect, measure, send
  if (!wokeByTimer) {
    bootAnimation();
  }

  wifiConnect();
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  initSensors();

  needFullRedraw = true;
  lastInteract = millis();

  Serial.printf("Awake window: %d seconds. Will deep-sleep after.\n", AWAKE_WINDOW_MS / 1000);
}

// ─────────────────────────────────────────────────────────────
// Loop
// ─────────────────────────────────────────────────────────────
void loop() {
  handleButton();

  // ── 30-second awake window — then deep sleep ──────────────
  if (millis() - lastInteract > AWAKE_MS) {
    goToDeepSleep();
    return;  // never reached — deep sleep restarts at setup()
  }

  frame++;
  mqttLoop();
  readAHT21();
  readMAX30102();
  readGSR();
  publishWatchData();

  breathPhase += 0.05f;
  if (breathPhase > PI2) breathPhase -= PI2;

  // v11: draw the full face only once, then update small dynamic zones.
  // This removes visible refresh/flicker and leaves more CPU time for MAX30102 BPM.
  if (needFullRedraw) {
    drawFace(true);
    needFullRedraw = false;
    lastUiDraw = millis();
  } else if (millis() - lastUiDraw >= UI_REFRESH_MS) {
    drawFace(false);
    lastUiDraw = millis();
  }

  delay(3);
}

// ─────────────────────────────────────────────────────────────
// Sensor init
// ─────────────────────────────────────────────────────────────
bool initSensors() {
  ahtOK = aht.begin();
  drawInitCard("AHT21B TEMP / HUM", ahtOK, 0, 3);
  delay(200);

  maxOK = particleSensor.begin(Wire, I2C_SPEED_FAST);
  if (maxOK) {
    // Heart-rate detection needs a clean pulse waveform. 25 SPS was too slow
    // with full-screen redraws, so use 100 SPS and read the full FIFO below.
    particleSensor.setup(
      0x5F,  // LED current. Use 0x3F if values saturate, 0x7F if signal is weak.
      4,     // Sample average
      2,     // Red + IR
      100,   // 100 SPS is good for BPM detection
      411,   // Long pulse width for better resolution
      16384  // Wide ADC range to avoid saturation
    );
    particleSensor.setPulseAmplitudeRed(0x5F);
    particleSensor.setPulseAmplitudeIR(0x5F);
    particleSensor.setPulseAmplitudeGreen(0);
    particleSensor.enableDIETEMPRDY();
  }
  drawInitCard("MAX30102 HR / SPO2", maxOK, 1, 3);
  delay(200);

  initGSR();
  drawInitCard("MEDEX GSR GPIO34", gsrOK, 2, 3);
  delay(500);

  tft.fillScreen(C_BLACK);
  return ahtOK || maxOK || gsrOK;
}

void initGSR() {
  analogReadResolution(12);
  analogSetPinAttenuation(GSR_PIN, ADC_11db);

  long sum = 0;
  for (int i = 0; i < 120; i++) {
    sum += analogRead(GSR_PIN);
    delay(8);
  }

  gsrBaseline = sum / 120.0f;
  gsrFiltered = gsrBaseline;
  gsrRaw = (int)gsrBaseline;
  gsrVoltage = gsrRaw * (3.3f / 4095.0f);
  gsrOK = true;

  Serial.print("MEDEX GSR baseline = ");
  Serial.println(gsrBaseline);
}

// ─────────────────────────────────────────────────────────────
// Sensor reads
// ─────────────────────────────────────────────────────────────
void readAHT21() {
  if (!ahtOK) return;
  if (millis() - lastAHTread < AHT_INTERVAL) return;
  lastAHTread = millis();

  sensors_event_t hEvent, tEvent;
  aht.getEvent(&hEvent, &tEvent);

  if (tEvent.temperature > -40.0f && tEvent.temperature < 85.0f) {
    ambientTemp = tEvent.temperature;
  }
  if (hEvent.relative_humidity >= 0.0f && hEvent.relative_humidity <= 100.0f) {
    humidity = hEvent.relative_humidity;
  }
}

void readMAX30102() {
  if (!maxOK) return;

  particleSensor.check();

  bool sawSample = false;

  // Process every FIFO sample. This is critical for BPM.
  while (particleSensor.available()) {
#ifdef MAX30102_CLONE
    // Keep compatibility with clone boards, but BPM uses the stronger channel below.
    long redVal = particleSensor.getFIFOIR();
    long irVal  = particleSensor.getFIFORed();
#else
    long redVal = particleSensor.getFIFORed();
    long irVal  = particleSensor.getFIFOIR();
#endif
    particleSensor.nextSample();

    sawSample = true;
    lastDbgRed = redVal;
    lastDbgIr  = irVal;

    // Some modules/finger positions give a stronger RED signal, others stronger IR.
    // Use the stronger channel for beat timing, but keep RED/IR for SpO2.
    long beatChannel = (irVal > redVal) ? irVal : redVal;
    lastDbgBeatChannel = beatChannel;
    fingerOn = (beatChannel > IR_FINGER_THRESHOLD);

    if (!fingerOn) {
      bpm = 0;
      spo2 = 0;
      spo2Smooth = 0;
      for (byte i = 0; i < HR_BUF_LEN; i++) rateBuffer[i] = 0;
      rateIdx = 0;
      lastBeat = 0;
      lastAdaptiveBeat = 0;
      ppgDC = 0.0f;
      ppgAC = 0.0f;
      ppgNoise = 0.0f;
      ppgHigh = false;
      continue;
    }

    bool beatSparkFun = checkForBeat(beatChannel);
    bool beatAdaptive = detectBeatAdaptive(beatChannel);
    bool beatDetected = beatSparkFun || beatAdaptive;

    if (beatDetected) {
      unsigned long now = millis();

      // Reject duplicate triggers from the same pulse.
      if (lastBeat == 0) {
        lastBeat = now;
      } else if (now - lastBeat > 300) {
        long delta = now - lastBeat;
        lastBeat = now;

        int instantBPM = 60000 / delta;

        // Valid resting/active range. Movement spikes are rejected.
        if (instantBPM >= 40 && instantBPM <= 190) {
          rateBuffer[rateIdx % HR_BUF_LEN] = (byte)instantBPM;
          rateIdx++;

          long sum = 0;
          byte count = 0;
          byte maxCount = rateIdx < HR_BUF_LEN ? rateIdx : HR_BUF_LEN;
          for (byte i = 0; i < maxCount; i++) {
            if (rateBuffer[i] > 0) {
              sum += rateBuffer[i];
              count++;
            }
          }

          if (count > 0) bpm = sum / count;
        }
      }
    }

    // SpO2 estimate from RED/IR AC/DC ratio. It can appear before BPM because
    // BPM needs repeated clean beat timing.
    redBuf[spo2BufIdx] = redVal;
    irBuf[spo2BufIdx]  = irVal;
    spo2BufIdx = (spo2BufIdx + 1) % SPO2_SAMPLES;

    if (spo2BufIdx == 0) {
      int newSpO2 = calcSpO2(redBuf, irBuf, SPO2_SAMPLES);
      if (newSpO2 >= 70 && newSpO2 <= 100) {
        if (spo2Smooth == 0) spo2Smooth = newSpO2;
        else spo2Smooth = (spo2Smooth * 3 + newSpO2) / 4;
        spo2 = spo2Smooth;
      }
    }
  }

  if (sawSample && millis() - lastSerialMAX > 1000) {
    lastSerialMAX = millis();
    Serial.print("MAX RED=");
    Serial.print(lastDbgRed);
    Serial.print(" IR=");
    Serial.print(lastDbgIr);
    Serial.print(" BEAT_CH=");
    Serial.print(lastDbgBeatChannel);
    Serial.print(" AC=");
    Serial.print(ppgAC, 1);
    Serial.print(" noise=");
    Serial.print(ppgNoise, 1);
    Serial.print(" finger=");
    Serial.print(fingerOn ? "YES" : "NO");
    Serial.print(" BPM=");
    Serial.print(bpm);
    Serial.print(" SpO2=");
    Serial.println(spo2);
  }
}

bool detectBeatAdaptive(long sample) {
  if (sample < IR_FINGER_THRESHOLD) return false;

  if (ppgDC <= 1.0f) ppgDC = sample;

  // DC removal: use faster alpha (0.90 instead of 0.96) so the DC baseline
  // tracks slow finger-pressure drift without contaminating the heartbeat AC.
  ppgDC = 0.90f * ppgDC + 0.10f * sample;
  float ac = sample - ppgDC;
  ppgAC = 0.75f * ppgAC + 0.25f * ac;

  // Noise estimate on the ABSOLUTE value — works for both signal polarities.
  ppgNoise = 0.95f * ppgNoise + 0.05f * fabs(ppgAC);

  float threshold = ppgNoise * 1.35f;
  if (threshold <   80.0f) threshold =   80.0f;   // more sensitive minimum
  if (threshold > 3000.0f) threshold = 3000.0f;   // raised ceiling for strong signals

  unsigned long now = millis();
  bool beat = false;

  // Use fabs(ppgAC) so we catch beats in EITHER direction:
  //   • Reflection mode (MAX30102 on finger/wrist) → negative dip at systole.
  //   • Transmission mode → positive peak at systole.
  if (!ppgHigh && fabs(ppgAC) > threshold && now - lastAdaptiveBeat > 300) {
    beat = true;
    lastAdaptiveBeat = now;
    ppgHigh = true;
  }

  // Hysteresis: wait until signal returns to baseline before allowing next beat.
  if (fabs(ppgAC) < threshold * 0.45f) {
    ppgHigh = false;
  }

  return beat;
}


void readGSR() {
  if (!gsrOK) return;
  if (millis() - lastGSRread < GSR_INTERVAL) return;
  lastGSRread = millis();

  gsrRaw = analogRead(GSR_PIN);
  gsrVoltage = gsrRaw * (3.3f / 4095.0f);

  // Strong smoothing to remove ADC noise
  gsrFiltered = 0.90f * gsrFiltered + 0.10f * gsrRaw;
  gsrDelta = abs((int)(gsrFiltered - gsrBaseline));

  // Contact estimate: avoid considering a floating/saturated pin valid
  gsrContact = (gsrRaw > 20 && gsrRaw < 4070);

  // MEDEX arousal index from the user's own baseline
  medexLevel = constrain(map(gsrDelta, 25, 800, 0, 100), 0, 100);

  // Baseline slowly follows only when stable
  if (gsrDelta < 70) {
    gsrBaseline = 0.999f * gsrBaseline + 0.001f * gsrFiltered;
  }

  if (millis() - lastSerialGSR > 1000) {
    lastSerialGSR = millis();
    Serial.print("GSR raw=");
    Serial.print(gsrRaw);
    Serial.print(" V=");
    Serial.print(gsrVoltage, 2);
    Serial.print(" filtered=");
    Serial.print(gsrFiltered, 1);
    Serial.print(" baseline=");
    Serial.print(gsrBaseline, 1);
    Serial.print(" delta=");
    Serial.print(gsrDelta);
    Serial.print(" MEDEX=");
    Serial.println(medexLevel);
  }
}

int calcSpO2(long* red, long* ir, int n) {
  long redMax = red[0], redMin = red[0];
  long irMax  = ir[0],  irMin  = ir[0];
  long redSum = 0, irSum = 0;

  for (int i = 0; i < n; i++) {
    if (red[i] > redMax) redMax = red[i];
    if (red[i] < redMin) redMin = red[i];
    if (ir[i]  > irMax)  irMax  = ir[i];
    if (ir[i]  < irMin)  irMin  = ir[i];
    redSum += red[i];
    irSum  += ir[i];
  }

  float redAC = (float)(redMax - redMin);
  float irAC  = (float)(irMax  - irMin);
  float redDC = (float)redSum / n;
  float irDC  = (float)irSum  / n;

  if (irDC < 5000.0f || redDC < 5000.0f) return 0;
  if (irAC < 200.0f || redAC < 200.0f) return 0;

  float R = (redAC / redDC) / (irAC / irDC);
  int result = (int)(104.0f - 17.0f * R);
  return constrain(result, 50, 100);
}

// ─────────────────────────────────────────────────────────────
// Boot / Wi-Fi
// ─────────────────────────────────────────────────────────────
void bootAnimation() {
  tft.fillScreen(C_BLACK);

  for (int r = 12; r <= 110; r += 4) {
    tft.drawCircle(CX, CY, r, (r % 12 == 0) ? MED_ACCENT2 : MED_ACCENT);
    delay(8);
  }

  tft.setFont(&FreeSansBold12pt7b);
  drawCenteredText("MEDEX", 0, 91, 240, C_WHITE, &FreeSansBold12pt7b, 1);

  tft.setFont(NULL);
  drawCenteredText("SMART HEALTH WATCH", 0, 124, 240, MED_ACCENT2, NULL, 1);
  drawCenteredText("GSR  HR  SpO2  TEMP", 0, 140, 240, C_DIM, NULL, 1);

  int barX = 45, barY = 163, barW = 150;
  tft.drawRoundRect(barX, barY, barW, 6, 3, C_LINE);
  for (int p = 0; p <= barW - 4; p += 3) {
    tft.fillRoundRect(barX + 2, barY + 2, p, 2, 1, MED_ACCENT2);
    delay(12);
  }

  delay(400);
  tft.fillScreen(C_BLACK);
}

void wifiConnect() {
  tft.fillScreen(C_BLACK);
  tft.drawCircle(CX, CY, 112, C_LINE);
  drawCenteredText("Wi-Fi", 0, 84, 240, MED_ACCENT2, &FreeSansBold9pt7b, 1);
  drawCenteredText(ssid, 0, 112, 240, C_OFFWHITE, NULL, 1);

  // Static IP — bypasses dnsmasq DHCP entirely.
  // nmcli hotspot always assigns 10.42.0.1 to the Pi (NetworkManager shared mode).
  // With a fixed IP the watch reconnects instantly regardless of dnsmasq lease state.
  static const IPAddress WATCH_IP (10, 42, 0, 100);
  static const IPAddress HOTSPOT_GW(10, 42, 0,   1);
  static const IPAddress SUBNET    (255, 255, 255, 0);

  // Pre-set the MQTT broker IP — it's always the hotspot gateway
  mqttBrokerIp = HOTSPOT_GW;
  mqttClient.setServer(mqttBrokerIp, mqttPort);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false);   // keep credentials in RAM, just disconnect
  delay(200);
  WiFi.config(WATCH_IP, HOTSPOT_GW, SUBNET, HOTSPOT_GW);  // static IP before begin()
  WiFi.begin(ssid, password);

  // --- Pass 1: wait up to ~18 seconds (100 × 180 ms) ---
  int timeout = 0;
  int oldX = -1, oldY = -1;
  while (WiFi.status() != WL_CONNECTED && timeout < 100) {
    if (oldX >= 0) tft.fillCircle(oldX, oldY, 5, C_BLACK);

    float a = radians(timeout * (360.0f / 100.0f));
    int x = CX + (int)(cos(a * DEG_TO_RAD) * 70);
    int y = CY + (int)(sin(a * DEG_TO_RAD) * 70);
    tft.fillCircle(x, y, 5, MED_ACCENT2);
    oldX = x; oldY = y;

    delay(180);
    timeout++;
  }

  // --- Pass 2: if still not connected, retry once more ---
  if (WiFi.status() != WL_CONNECTED) {
    tft.fillRect(20, 130, 200, 20, C_BLACK);
    drawCenteredText("Retrying...", 0, 143, 240, C_AMBER, NULL, 1);

    WiFi.disconnect(false);  // keep credentials, just reset the connection
    delay(500);
    WiFi.config(WATCH_IP, HOTSPOT_GW, SUBNET, HOTSPOT_GW);  // reapply static IP
    WiFi.begin(ssid, password);

    timeout = 0;
    oldX = -1; oldY = -1;
    while (WiFi.status() != WL_CONNECTED && timeout < 100) {
      if (oldX >= 0) tft.fillCircle(oldX, oldY, 5, C_BLACK);

      float a = radians(timeout * (360.0f / 100.0f));
      int x = CX + (int)(cos(a * DEG_TO_RAD) * 70);
      int y = CY + (int)(sin(a * DEG_TO_RAD) * 70);
      tft.fillCircle(x, y, 5, C_ORANGE);
      oldX = x; oldY = y;

      delay(180);
      timeout++;
    }
  }

  bool ok = WiFi.status() == WL_CONNECTED;
  if (ok) {
    mqttConnect();
  }
  tft.fillRect(35, 140, 170, 22, C_BLACK);
  drawCenteredText(ok ? "Connected" : "Offline mode", 0, 154, 240, ok ? C_GREEN : C_AMBER, NULL, 1);
  delay(700);
  tft.fillScreen(C_BLACK);
}


void mqttConnect() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;

  // Broker IP is always 10.42.0.1 (set at boot) — no need to re-read gatewayIP()

  char clientId[40];
  snprintf(clientId, sizeof(clientId), "MEDEX-WATCH-%08lX", (unsigned long)ESP.getEfuseMac());

  if (mqttClient.connect(clientId)) {
    Serial.print("MQTT connected to ");
    Serial.println(mqttBrokerIp);
    mqttClient.publish("smartwatch/status", "online", true);
  } else {
    Serial.print("MQTT connect failed, rc=");
    Serial.println(mqttClient.state());
  }
}

// Timestamp of last Wi-Fi reconnect attempt (avoids hammering WiFi.begin)
static unsigned long lastWifiRetry  = 0;
const unsigned long WIFI_RETRY_MS   = 20000;  // 20 s between retries

// Watchdog: detect when ESP32 is stuck in WL_IDLE_STATUS (mid-connection)
// with no progress — this happens when association times out silently.
static unsigned long wifiIdleStart  = 0;
const unsigned long WIFI_IDLE_MAX   = 30000;  // force reset after 30 s stuck in IDLE

void mqttLoop() {
  // ── Wi-Fi self-heal ─────────────────────────────────────────
  wl_status_t wifiStatus = WiFi.status();

  if (wifiStatus != WL_CONNECTED) {

    if (wifiStatus == WL_IDLE_STATUS) {
      // ESP32 is already mid-connection; DON'T call WiFi.begin() again.
      // BUT if stuck in IDLE for too long, force a full reset.
      if (wifiIdleStart == 0) wifiIdleStart = millis();
      else if (millis() - wifiIdleStart > WIFI_IDLE_MAX) {
        wifiIdleStart   = 0;
        lastWifiRetry   = millis();
        Serial.println("[WiFi] Stuck in IDLE >30 s — forcing full reset");
        WiFi.disconnect(false);
        delay(500);
        WiFi.config(IPAddress(10,42,0,100), IPAddress(10,42,0,1),
                    IPAddress(255,255,255,0), IPAddress(10,42,0,1));
        WiFi.begin(ssid, password);
      }
    } else {
      wifiIdleStart = 0;

      bool canRetry = (wifiStatus == WL_DISCONNECTED   ||
                       wifiStatus == WL_CONNECT_FAILED  ||
                       wifiStatus == WL_CONNECTION_LOST ||
                       wifiStatus == WL_NO_SSID_AVAIL);

      if (canRetry && millis() - lastWifiRetry > WIFI_RETRY_MS) {
        lastWifiRetry = millis();
        Serial.print("[WiFi] Reconnecting, status=");
        Serial.println((int)wifiStatus);
        WiFi.disconnect(false);
        delay(100);
        WiFi.config(IPAddress(10,42,0,100), IPAddress(10,42,0,1),
                    IPAddress(255,255,255,0), IPAddress(10,42,0,1));
        WiFi.begin(ssid, password);
      }
    }

    return;
  }

  // Wi-Fi is up — reset watchdogs
  wifiIdleStart = 0;
  lastWifiRetry = millis();

  // ── MQTT self-heal ───────────────────────────────────────────
  if (!mqttClient.connected()) mqttConnect();
  mqttClient.loop();
}

void publishWatchData() {
  if (WiFi.status() != WL_CONNECTED || !mqttClient.connected()) return;
  if (millis() - lastMqttPublish < MQTT_PUBLISH_MS) return;
  lastMqttPublish = millis();

  char payload[16];

  snprintf(payload, sizeof(payload), "%d", fingerOn ? bpm : 0);
  mqttClient.publish("smartwatch/heart_rate", payload, true);

  snprintf(payload, sizeof(payload), "%d", fingerOn ? spo2 : 0);
  mqttClient.publish("smartwatch/spo2", payload, true);

  dtostrf(ambientTemp, 4, 1, payload);
  mqttClient.publish("smartwatch/temp", payload, true);

  dtostrf(humidity, 4, 1, payload);
  mqttClient.publish("smartwatch/humidity", payload, true);

  snprintf(payload, sizeof(payload), "%d", gsrRaw);
  mqttClient.publish("smartwatch/gsr", payload, true);

  snprintf(payload, sizeof(payload), "%d", medexLevel);
  mqttClient.publish("smartwatch/medex", payload, true);

  snprintf(payload, sizeof(payload), "%d", batteryPct);
  mqttClient.publish("smartwatch/battery", payload, true);

  mqttClient.publish("smartwatch/finger", fingerOn ? "1" : "0", true);
  mqttClient.publish("smartwatch/gsr_contact", gsrContact ? "1" : "0", true);
  mqttClient.publish("smartwatch/status", "online", true);
}

void drawInitCard(const char* label, bool ok, int step, int total) {
  tft.fillScreen(C_BLACK);
  tft.drawCircle(CX, CY, 114, C_LINE);

  tft.fillRoundRect(35, 78, 170, 78, 14, C_PANEL);
  tft.drawRoundRect(35, 78, 170, 78, 14, ok ? C_GREEN : C_RED_DIM);

  drawCenteredText("SENSOR CHECK", 0, 96, 240, C_DIM, NULL, 1);
  drawCenteredText(label, 0, 119, 240, C_OFFWHITE, NULL, 1);
  drawCenteredText(ok ? "READY" : "NOT FOUND", 0, 142, 240, ok ? C_GREEN : C_RED, NULL, 1);

  int spacing = 16;
  int startX = CX - (total - 1) * spacing / 2;
  for (int i = 0; i < total; i++) {
    tft.fillCircle(startX + i * spacing, 173, 4, (i <= step) ? MED_ACCENT2 : C_LINE);
  }
}

// ─────────────────────────────────────────────────────────────
// Face dispatcher
// ─────────────────────────────────────────────────────────────
void drawFace(bool full) {
  if (full) resetPrev();

  switch (currentFace) {
    case FACE_MEDEX:      drawFaceMedex(full);      break;
    case FACE_VITALS:     drawFaceVitals(full);     break;
    case FACE_ANALOG_PRO: drawFaceAnalogPro(full);  break;
    case FACE_GSR_FOCUS:  drawFaceGSRFocus(full);   break;
    case FACE_MISSION:    drawFaceMission(full);    break;
    case FACE_MINIMAL:    drawFaceMinimal(full);    break;
  }
}

void resetPrev() {
  prevBpm = prevSpo2 = prevBatt = prevMedex = prevGsrRaw = -999;
  prevTempInt = prevHumInt = -999;
  prevSecDotX = prevSecDotY = -1;
  lastSecond = -1;
  lastMinute = -1;
}

void drawMetricCard(int x, int y, int w, int h,
                    const char* label,
                    const char* value,
                    const char* unit,
                    uint16_t accent,
                    uint16_t fillColor) {
  tft.fillRoundRect(x, y, w, h, 14, fillColor);
  tft.drawRoundRect(x, y, w, h, 14, C_LINE);
  tft.fillCircle(x + 12, y + 13, 3, accent);

  tft.setFont(NULL);
  tft.setTextSize(1);
  tft.setTextColor(C_DIM);
  tft.setCursor(x + 22, y + 16);
  tft.print(label);

  tft.setTextSize(2);
  tft.setTextColor(accent);
  tft.setCursor(x + 12, y + h - 13);
  tft.print(value);

  tft.setTextSize(1);
  tft.setTextColor(C_OFFWHITE);
  tft.setCursor(x + w - 30, y + h - 13);
  tft.print(unit);
}



// Compatibility box helper. Some older UI calls used drawValueBox().
void drawValueBox(int x, int y, int w, int h,
                  const char* label,
                  const char* value,
                  const char* unit,
                  uint16_t accent) {
  drawMetricCard(x, y, w, h, label, value, unit, accent, C_PANEL);
}

void drawPageDots(uint16_t activeColor) {
  int startX = 82;
  int y = 213;
  for (int i = 0; i < NUM_FACES; i++) {
    uint16_t c = (i == currentFace) ? activeColor : C_LINE;
    tft.fillCircle(startX + i * 15, y, (i == currentFace) ? 4 : 3, c);
  }
}

void makeSensorStrings(char* hr, char* ox, char* temp, char* gsr) {
  if (fingerOn && bpm > 0) sprintf(hr, "%d", bpm); else strcpy(hr, "--");
  if (fingerOn && spo2 > 0) sprintf(ox, "%d", spo2); else strcpy(ox, "--");
  if (ahtOK) dtostrf(ambientTemp, 4, 1, temp); else strcpy(temp, "--.-");
  if (gsrOK) sprintf(gsr, "%d", medexLevel); else strcpy(gsr, "--");
}

uint16_t medexColor() {
  return medexLevel < 35 ? C_GREEN : (medexLevel < 70 ? C_AMBER : C_RED);
}

// ─────────────────────────────────────────────────────────────
// FACE 0 — Clean MEDEX Home
// ─────────────────────────────────────────────────────────────
void drawFaceMedex(bool full) {
  struct tm t; getWatchTime(t);
  char timebuf[6]; sprintf(timebuf, "%02d:%02d", t.tm_hour, t.tm_min);
  char secbuf[3];  sprintf(secbuf, "%02d", t.tm_sec);

  char hr[10], ox[10], temp[10], gsr[10];
  makeSensorStrings(hr, ox, temp, gsr);

  if (full) {
    tft.fillScreen(C_BLACK);
    tft.drawCircle(CX, CY, 118, MED_ACCENT2);
    tft.drawCircle(CX, CY, 111, C_LINE);
    drawHeader("MEDEX", MED_ACCENT2);
    drawFooterDots(82, 206);
    drawPageDots(MED_ACCENT2);
  }

  // Update only the changing areas. No full-screen refresh flicker.
  drawRingGauge(CX, CY, 105, medexLevel, medexColor(), C_PANEL2, 5);
  drawBattery(178, 26, batteryPct);

  tft.fillRect(50, 67, 140, 50, C_BLACK);
  drawCenteredText(timebuf, 0, 93, 240, C_WHITE, &FreeSansBold12pt7b, 1);
  drawCenteredText(secbuf, 0, 112, 240, MED_ACCENT2, NULL, 1);

  // Main horizontal status pill
  tft.fillRoundRect(36, 126, 168, 44, 18, C_PANEL);
  tft.drawRoundRect(36, 126, 168, 44, 18, C_LINE);

  tft.setFont(NULL);
  tft.setTextSize(1);
  tft.setTextColor(MED_HR);   tft.setCursor(52, 143); tft.print("HR");
  tft.setTextColor(C_WHITE);   tft.setCursor(72, 143); tft.print(hr);
  tft.setTextColor(MED_GSR);  tft.setCursor(122, 143); tft.print("GSR");
  tft.setTextColor(medexColor()); tft.setCursor(151, 143); tft.print(gsr); tft.print("%");

  const char* state = medexLevel < 35 ? "RELAXED" : medexLevel < 70 ? "ACTIVE" : "HIGH";
  tft.fillRect(50, 172, 140, 24, C_BLACK);
  drawCenteredText(state, 0, 188, 240, medexColor(), &FreeSansBold9pt7b, 1);

  if (!full) drawFooterDots(82, 206);
}

// ─────────────────────────────────────────────────────────────
// FACE 1 — Big Vitals Cards
// ─────────────────────────────────────────────────────────────
void drawFaceVitals(bool full) {
  struct tm t; getWatchTime(t);
  char timebuf[6]; sprintf(timebuf, "%02d:%02d", t.tm_hour, t.tm_min);

  char hr[10], ox[10], temp[10], gsr[10];
  makeSensorStrings(hr, ox, temp, gsr);

  if (full) {
    tft.fillScreen(C_BLACK);
    tft.drawCircle(CX, CY, 118, MED_ACCENT2);
    tft.drawCircle(CX, CY, 111, C_LINE);
    drawHeader("VITALS PRO", MED_ACCENT2);
    drawPageDots(MED_ACCENT2);
  }
  tft.fillRect(70, 42, 100, 30, C_BLACK);
  drawCenteredText(timebuf, 0, 62, 240, C_WHITE, &FreeSansBold9pt7b, 1);
  drawBattery(178, 26, batteryPct);

  drawMetricCard(24, 82, 92, 50, "HEART", hr, "bpm", fingerOn && bpm > 0 ? MED_HR : C_DIM, tft.color565(18, 5, 8));
  drawMetricCard(124, 82, 92, 50, "OXYGEN", ox, "%", fingerOn && spo2 > 0 ? MED_SPO2 : C_DIM, tft.color565(3, 11, 24));
  drawMetricCard(24, 142, 92, 50, "TEMP", temp, "C", ahtOK ? MED_TEMP : C_DIM, tft.color565(17, 11, 2));
  drawMetricCard(124, 142, 92, 50, "MEDEX", gsr, "%", gsrOK ? medexColor() : C_DIM, tft.color565(4, 18, 10));
}

// ─────────────────────────────────────────────────────────────
// FACE 2 — Analog Pro
// ─────────────────────────────────────────────────────────────
void drawFaceAnalogPro(bool full) {
  struct tm t; getWatchTime(t);

  if (full) {
    tft.fillScreen(C_BLACK);
    tft.drawCircle(CX, CY, 118, MED_ACCENT2);
    tft.drawCircle(CX, CY, 113, C_LINE);

    for (int m = 0; m < 60; m++) {
      float a = radians(m * 6 - 90);
      int r1 = (m % 5 == 0) ? 98 : 104;
      int r2 = 110;
      uint16_t col = (m % 15 == 0) ? C_WHITE : (m % 5 == 0 ? C_DIM : C_LINE);
      tft.drawLine(CX + (int)(cos(a) * r1), CY + (int)(sin(a) * r1),
                   CX + (int)(cos(a) * r2), CY + (int)(sin(a) * r2), col);
    }
    drawCenteredText("MEDEX", 0, 54, 240, MED_ACCENT2, NULL, 1);
    drawPageDots(MED_ACCENT2);
  }

  // Clear only the hand area; keep bezel/ticks stable.
  tft.fillCircle(CX, CY, 88, C_BLACK);
  tft.drawCircle(CX, CY, 88, C_PANEL2);
  drawCenteredText("MEDEX", 0, 54, 240, MED_ACCENT2, NULL, 1);
  drawAnalogHands(t.tm_hour, t.tm_min, t.tm_sec);

  char small[24];
  sprintf(small, "%d%%  GSR", medexLevel);
  tft.fillRoundRect(75, 179, 90, 24, 12, C_PANEL);
  drawCenteredText(small, 75, 195, 90, medexColor(), NULL, 1);

  drawBattery(174, 60, batteryPct);
}



// ─────────────────────────────────────────────────────────────
// Analog face hands
// Fix for linker error: undefined reference to drawAnalogHands(...)
// ─────────────────────────────────────────────────────────────
void drawAnalogHands(int hh, int mm, int ss) {
  // Convert clock values to degrees where 0 degrees is 12 o'clock.
  float hourDeg = ((hh % 12) + (mm / 60.0f)) * 30.0f - 90.0f;
  float minDeg  = (mm + (ss / 60.0f)) * 6.0f - 90.0f;
  float secDeg  = ss * 6.0f - 90.0f;

  auto drawHand = [](float deg, int len, int thick, uint16_t color) {
    float a = radians(deg);
    int x2 = CX + (int)(cos(a) * len);
    int y2 = CY + (int)(sin(a) * len);

    // Draw parallel lines to make a clean thick hand.
    for (int i = -thick / 2; i <= thick / 2; i++) {
      int ox = (int)(-sin(a) * i);
      int oy = (int)( cos(a) * i);
      tft.drawLine(CX + ox, CY + oy, x2 + ox, y2 + oy, color);
    }

    tft.fillCircle(x2, y2, max(1, thick / 2), color);
  };

  drawHand(hourDeg, 48, 5, C_WHITE);
  drawHand(minDeg,  72, 3, MED_ACCENT2);
  drawHand(secDeg,  82, 1, MED_HR);

  // Center cap
  tft.fillCircle(CX, CY, 8, C_WHITE);
  tft.fillCircle(CX, CY, 5, MED_HR);
  tft.fillCircle(CX, CY, 2, C_WHITE);
}

// ─────────────────────────────────────────────────────────────
// FACE 3 — MEDEX GSR Focus
// ─────────────────────────────────────────────────────────────
void drawFaceGSRFocus(bool full) {
  struct tm t; getWatchTime(t);
  char timebuf[6]; sprintf(timebuf, "%02d:%02d", t.tm_hour, t.tm_min);

  uint16_t col = medexColor();
  if (full) {
    tft.fillScreen(C_BLACK);
    tft.drawCircle(CX, CY, 118, col);
    tft.drawCircle(CX, CY, 111, C_LINE);
    drawHeader("MEDEX GSR", col);
    drawPageDots(col);
  }
  drawBattery(178, 26, batteryPct);

  drawRingGauge(CX, CY, 82, medexLevel, col, C_PANEL2, 11);
  tft.fillCircle(CX, CY, 55, C_BLACK);
  tft.drawCircle(CX, CY, 55, C_LINE);

  char pct[12]; sprintf(pct, "%d%%", medexLevel);
  drawCenteredText(pct, 0, 121, 240, col, &FreeSansBold12pt7b, 1);

  const char* state = medexLevel < 35 ? "RELAXED" : medexLevel < 70 ? "ACTIVE" : "HIGH AROUSAL";
  drawCenteredText(state, 0, 145, 240, C_WHITE, &FreeSansBold9pt7b, 1);

  tft.fillRoundRect(40, 164, 160, 31, 14, C_PANEL);
  tft.drawRoundRect(40, 164, 160, 31, 14, C_LINE);
  tft.setFont(NULL); tft.setTextSize(1);
  tft.setTextColor(C_DIM); tft.setCursor(58, 177); tft.print("RAW");
  tft.setTextColor(MED_GSR); tft.setCursor(84, 177); tft.print(gsrRaw);
  tft.setTextColor(C_DIM); tft.setCursor(132, 177); tft.print("V");
  tft.setTextColor(C_WHITE); tft.setCursor(146, 177); tft.print(gsrVoltage, 1);

  tft.fillRect(82, 197, 76, 14, C_BLACK);
  drawCenteredText(timebuf, 0, 207, 240, C_DIM, NULL, 1);
}

// ─────────────────────────────────────────────────────────────
// FACE 4 — Mission Health
// ─────────────────────────────────────────────────────────────
void drawFaceMission(bool full) {
  struct tm t; getWatchTime(t);
  char timebuf[9]; sprintf(timebuf, "%02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
  char hr[10], ox[10], temp[10], gsr[10];
  makeSensorStrings(hr, ox, temp, gsr);

  if (full) {
    tft.fillScreen(C_BLACK);
    tft.drawCircle(CX, CY, 118, C_AMBER);
    tft.drawCircle(CX, CY, 112, C_LINE);
    tft.drawLine(7, CY, 25, CY, C_AMBER);
    tft.drawLine(215, CY, 233, CY, C_AMBER);
    tft.drawLine(CX, 7, CX, 25, C_AMBER);
    tft.drawLine(CX, 215, CX, 233, C_AMBER);
    drawHeader("MISSION HEALTH", C_AMBER);
    drawPageDots(C_AMBER);
  }
  tft.fillRect(50, 69, 140, 28, C_BLACK);
  drawCenteredText(timebuf, 0, 91, 240, C_WHITE, &FreeSansBold9pt7b, 1);

  tft.fillRoundRect(40, 108, 160, 72, 16, tft.color565(10, 9, 4));
  tft.drawRoundRect(40, 108, 160, 72, 16, tft.color565(90, 65, 10));

  tft.setFont(NULL); tft.setTextSize(1);
  tft.setTextColor(MED_HR);   tft.setCursor(58, 128); tft.print("HR ");  tft.setTextColor(C_WHITE); tft.print(hr);
  tft.setTextColor(MED_SPO2); tft.setCursor(126,128); tft.print("O2 ");  tft.setTextColor(C_WHITE); tft.print(ox);
  tft.setTextColor(MED_TEMP); tft.setCursor(58, 153); tft.print("T ");   tft.setTextColor(C_WHITE); tft.print(temp);
  tft.setTextColor(MED_GSR);  tft.setCursor(126,153); tft.print("GSR "); tft.setTextColor(medexColor()); tft.print(gsr); tft.print("%");

  drawRingGauge(CX, CY, 96, medexLevel, medexColor(), C_PANEL2, 4);
}

// ─────────────────────────────────────────────────────────────
// FACE 5 — Minimal Pro
// ─────────────────────────────────────────────────────────────
void drawFaceMinimal(bool full) {
  struct tm t; getWatchTime(t);
  char timebuf[6]; sprintf(timebuf, "%02d:%02d", t.tm_hour, t.tm_min);
  char secbuf[3];  sprintf(secbuf, "%02d", t.tm_sec);

  if (full) {
    tft.fillScreen(C_BLACK);
    tft.drawCircle(CX, CY, 118, C_VIOLET);
    tft.drawCircle(CX, CY, 110, C_LINE);
    drawPageDots(C_VIOLET);
  }
  drawRingGauge(CX, CY, 98, (t.tm_sec * 100) / 59, C_VIOLET, C_PANEL2, 5);

  tft.fillRect(50, 86, 140, 56, C_BLACK);
  drawCenteredText(timebuf, 0, 116, 240, C_WHITE, &FreeSansBold12pt7b, 1);
  drawCenteredText(secbuf, 0, 138, 240, C_VIOLET, NULL, 1);

  tft.fillRoundRect(38, 158, 164, 34, 16, C_PANEL);
  tft.drawRoundRect(38, 158, 164, 34, 16, C_LINE);
  tft.setFont(NULL); tft.setTextSize(1);
  tft.setTextColor(MED_HR); tft.setCursor(54, 178);
  if (fingerOn && bpm > 0) tft.print(bpm); else tft.print("--");
  tft.setTextColor(C_DIM); tft.print(" bpm   ");
  tft.setTextColor(medexColor()); tft.print(medexLevel); tft.print("%");
  tft.setTextColor(C_DIM); tft.print(" GSR");

  drawBattery(178, 60, batteryPct);
}

// ─────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────
void drawHeader(const char* title, uint16_t accent) {
  tft.fillRoundRect(39, 14, 162, 19, 10, C_PANEL);
  tft.drawRoundRect(39, 14, 162, 19, 10, C_LINE);
  tft.fillCircle(51, 23, 3, accent);

  tft.setFont(NULL);
  tft.setTextSize(1);
  tft.setTextColor(C_OFFWHITE);
  tft.setCursor(63, 27);
  tft.print(title);
}

void drawFooterDots(int x, int y) {
  // Three clear sensor dots: AHT, MAX30102, GSR. No tiny text near the edge.
  tft.fillCircle(x,      y, 4, ahtOK ? C_GREEN : C_RED_DIM);
  tft.fillCircle(x + 16, y, 4, maxOK ? (fingerOn ? MED_HR : C_AMBER) : C_RED_DIM);
  tft.fillCircle(x + 32, y, 4, gsrOK ? MED_GSR : C_RED_DIM);
}

void drawBattery(int x, int y, int pct) {
  tft.drawRoundRect(x, y, 20, 10, 2, C_DIM);
  tft.fillRect(x + 20, y + 3, 2, 4, C_DIM);
  tft.fillRect(x + 2, y + 2, 16, 6, C_BLACK);
  int fw = constrain((pct * 16) / 100, 0, 16);
  uint16_t col = pct > 50 ? C_GREEN : (pct > 20 ? C_AMBER : C_RED);
  if (fw > 0) tft.fillRect(x + 2, y + 2, fw, 6, col);
}

void drawCenteredText(const char* txt, int x, int y, int w, uint16_t color, const GFXfont* font, uint8_t size) {
  tft.setFont(font);
  tft.setTextSize(size);
  tft.setTextColor(color);

  int16_t bx, by;
  uint16_t bw, bh;
  tft.getTextBounds(txt, 0, 0, &bx, &by, &bw, &bh);
  int cx = x + (w - bw) / 2;
  tft.setCursor(cx, y);
  tft.print(txt);
  tft.setFont(NULL);
}

void drawArc(int cx, int cy, int r, float a1, float a2, uint16_t col, int thick) {
  if (a2 < a1) return;
  for (float a = a1; a <= a2; a += 1.0f) {
    float rad = radians(a);
    for (int t = 0; t < thick; t++) {
      int rr = r - t;
      tft.drawPixel(cx + (int)(cos(rad) * rr), cy + (int)(sin(rad) * rr), col);
    }
  }
}

void drawRingGauge(int cx, int cy, int r, int pct, uint16_t col, uint16_t bg, int thick) {
  pct = constrain(pct, 0, 100);
  // Erase whole gauge zone first; this avoids stacked pixels/artifacts.
  drawArc(cx, cy, r, -220, 40, bg, thick);
  drawArc(cx, cy, r, -220, -220 + 260.0f * pct / 100.0f, col, thick);
}

void drawECG(int x0, int y0, int w, int h, uint16_t col, uint16_t bg) {
  ecgIdx = (ecgIdx + 1) % ECG_LEN;
  ecgBuf[ecgIdx] = ECG_TEMPLATE[ecgIdx % 32];

  tft.fillRect(x0, y0, w, h, bg);
  int midY = y0 + h / 2;

  // grid
  for (int x = x0; x <= x0 + w; x += 20) tft.drawFastVLine(x, y0, h, tft.color565(6, 24, 32));
  for (int y = y0; y <= y0 + h; y += 14) tft.drawFastHLine(x0, y, w, tft.color565(6, 24, 32));

  for (int i = 1; i < w && i < ECG_LEN; i++) {
    int idx1 = (ecgIdx - i + ECG_LEN) % ECG_LEN;
    int idx2 = (ecgIdx - i + 1 + ECG_LEN) % ECG_LEN;

    int px = x0 + w - i;
    int py = midY - ecgBuf[idx1] / 2;
    int nx = px + 1;
    int ny = midY - ecgBuf[idx2] / 2;

    py = constrain(py, y0 + 2, y0 + h - 2);
    ny = constrain(ny, y0 + 2, y0 + h - 2);

    uint16_t c = (i < 8) ? C_WHITE : col;
    tft.drawLine(px, py, nx, ny, c);
  }
}

void drawHeart(int x, int y, int r, uint16_t color) {
  tft.fillCircle(x - r, y, r, color);
  tft.fillCircle(x + r, y, r, color);
  tft.fillTriangle(x - 2 * r, y + r / 2, x + 2 * r, y + r / 2, x, y + 2 * r, color);
}

// ─────────────────────────────────────────────────────────────
// Time / sleep / button
// ─────────────────────────────────────────────────────────────
void getWatchTime(struct tm& t) {
  if (!getLocalTime(&t, 5)) {
    memset(&t, 0, sizeof(t));
    unsigned long s = millis() / 1000;
    t.tm_sec  = s % 60;
    t.tm_min  = (s / 60) % 60;
    t.tm_hour = (s / 3600) % 24;
    t.tm_mday = 1;
    t.tm_mon  = 0;
    t.tm_year = 126;
  }
}

void goToDeepSleep() {
  Serial.println("\n>>> Entering DEEP SLEEP for 10 minutes...");

  // Notify MQTT before sleeping
  if (mqttClient.connected()) {
    mqttClient.publish("smartwatch/status", "sleeping", true);
    mqttClient.loop();
    delay(100);  // let the message go out
    mqttClient.disconnect();
  }

  // Shrinking circle animation
  for (int r = 118; r >= 0; r -= 6) {
    tft.fillCircle(CX, CY, r, C_BLACK);
    delay(10);
  }
  tft.fillScreen(C_BLACK);

  // Shut down radios to save power
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  btStop();

  // Configure wake sources:
  //   1) Timer — auto wake every 10 minutes
  //   2) Button — GPIO14 ext0 wake on LOW (active-low push button)
  esp_sleep_enable_timer_wakeup(DEEP_SLEEP_DURATION_US);
  esp_sleep_enable_ext0_wakeup(BUTTON_WAKE_PIN, 0);  // 0 = wake on LOW

  Serial.println("Wake sources: 10-min timer + GPIO14 button");
  Serial.flush();

  esp_deep_sleep_start();  // CPU halts here — restarts at setup() on wake
  // *** Code below never executes ***
}

void wakeUp() {
  // This is now only called from legacy paths.
  // After deep sleep, setup() handles re-init.
  isAsleep = false;
  needFullRedraw = true;
  lastUiDraw = 0;
  lastInteract = millis();
  tft.fillScreen(C_BLACK);
  for (int r = 0; r <= 118; r += 8) {
    tft.drawCircle(CX, CY, r, MED_ACCENT2);
    delay(8);
  }
}

void handleButton() {
  bool state = digitalRead(BTN_FACE);

  if (state == LOW && lastBtnState == HIGH && millis() - lastBtnPress > 300) {
    lastBtnPress = millis();
    lastInteract = millis();  // reset the 30-second awake timer

    // Cycle to next watch face
    currentFace = (currentFace + 1) % NUM_FACES;
    needFullRedraw = true;
    lastUiDraw = 0;
    tft.fillScreen(C_BLACK);
  }

  lastBtnState = state;
}
