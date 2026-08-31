#include "inc/currentSensor.h"
#include "inc/pot.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// ACS712 30A module specifications (powered at 5V, no voltage divider)
// Sensitivity: ~66 mV per Ampere
#define ACS712_SENSITIVITY_MV_PER_A 66.0
// Offset voltage at 0A (VCC/2 = 2.5V for 5V supply)
#define ACS712_OFFSET_MV 2350.0
// Number of ADC samples to average for noise reduction
#define CURRENT_SAMPLES 10
// Deadband: ignore readings below this (mA) to suppress noise
#define CURRENT_DEADBAND_MA 200

void currentSensor_init(gpio_num_t gpio)
{
    pot_init(gpio);
}

int read_currentSensor(gpio_num_t gpio)
{
    // Multi-sample averaging to reduce ADC noise
    long sum = 0;
    int valid_count = 0;
    for (int i = 0; i < CURRENT_SAMPLES; i++) {
        int raw_val = read_pot(gpio);
        if (raw_val >= 0) {
            sum += raw_val;
            valid_count++;
        }
        vTaskDelay(2 / portTICK_PERIOD_MS); // small delay between samples
    }
    if (valid_count == 0) return 0;

    float avg_raw = (float)sum / (float)valid_count;

    // Convert averaged ADC (0-4095) to millivolts
    float mv = (avg_raw / 4095.0) * 3300.0;
    
    // Calculate current in Amps
    float current_A = (mv - ACS712_OFFSET_MV) / ACS712_SENSITIVITY_MV_PER_A;

    // Convert to milliAmps (absolute value — direction doesn't matter here)
    int current_mA = (int)(current_A * 1000.0);
    if (current_mA < 0) current_mA = -current_mA;

    // Apply deadband: suppress noise near zero
    if (current_mA < CURRENT_DEADBAND_MA) {
        current_mA = 0;
    }

    return current_mA;
}
