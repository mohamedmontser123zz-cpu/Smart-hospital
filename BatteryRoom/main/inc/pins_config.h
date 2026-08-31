#ifndef __pins_config__h_
#define __pins_config__h_

#include "driver/gpio.h"

// ══════════════════════════════════════════════════════════════════════════════
// PIN CONFIGURATION — BatteryRoom ESP32
// All GPIO assignments are defined here. Do NOT hardcode pin numbers elsewhere.
// ══════════════════════════════════════════════════════════════════════════════

// ── Voltage Sensors (ADC1, input-only is fine) ──────────────────────────────
#define PIN_VOLTAGE_BATTERY     GPIO_NUM_34   // Battery voltage (via voltage divider)
#define PIN_VOLTAGE_MAIN        GPIO_NUM_35   // Main grid voltage (via voltage divider)

// ── Current Sensors (ACS712) ────────────────────────────────────────────────
// Moved from GPIO 36/39 to GPIO 32/33
// GPIO 36 and 39 are input-only pins with no internal pull-down, causing
// the ACS712 offset voltage (~2.5V) to appear as leakage on the ADC.
// GPIO 32 and 33 support ADC1 and work correctly with the ACS712 module.
#define PIN_CURRENT_ROOM1       GPIO_NUM_32   // Room 1 current sensor (ACS712)
#define PIN_CURRENT_ROOM2       GPIO_NUM_33   // Room 2 current sensor (ACS712)

// ── Relay Control ───────────────────────────────────────────────────────────
#define PIN_RELAY               GPIO_NUM_22   // Relay: HIGH = battery, LOW = main grid

// ── LED Indicators ──────────────────────────────────────────────────────────
#define PIN_LED_BATTERY         GPIO_NUM_27   // LED: battery active indicator
#define PIN_LED_STATUS          GPIO_NUM_4    // LED: status blink

#endif // __pins_config__h_
