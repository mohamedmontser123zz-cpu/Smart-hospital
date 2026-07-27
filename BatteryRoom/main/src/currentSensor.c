#include "inc/currentSensor.h"
#include "inc/pot.h"

// ACS712 30A module specifications
// Sensitivity: ~66 mV per Ampere
#define ACS712_SENSITIVITY_MV_PER_A 66.0
// Offset voltage at 0A (typically VCC/2 = 1.65V for 3.3V ADC or 2.5V for 5V ADC)
// Assuming sensor is powered by 3.3V or its output is divided to be 1.65V at 0A
#define ACS712_OFFSET_MV 1650.0 

void currentSensor_init(gpio_num_t gpio)
{
    pot_init(gpio);
}

int read_currentSensor(gpio_num_t gpio)
{
    int raw_val = read_pot(gpio);
    if (raw_val < 0) return 0;

    // Convert raw ADC (0-4095) to millivolts
    // ESP32 ADC at 11dB attenuation measures ~0 to 3300mV roughly (though non-linear at edges)
    float mv = ((float)raw_val / 4095.0) * 3300.0;
    
    // Calculate current in Amps
    float current_A = (mv - ACS712_OFFSET_MV) / ACS712_SENSITIVITY_MV_PER_A;

    // Return in milliAmps
    return (int)(current_A * 1000.0);
}
