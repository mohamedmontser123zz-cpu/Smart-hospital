#include "inc/voltageSensor.h"
#include "inc/pot.h"



void voltageSensor_init(gpio_num_t gpio)
{
    pot_init(gpio);
}

int read_voltageSensor(gpio_num_t gpio)
{
    int value = read_pot(gpio);
    if (value < 0) return -1;

    // Step 1: Convert ADC value to Vout (0–3.3V) 2450 
    float v_out = ((float)value / 4095.0) * 3.3;
   // printf("Debug: ADC Value: %d, Vout: %.2fV\n", value, v_out); // Debug print

    // Step 2: Convert to real input voltage using divider


    float v_in = v_out * ((R1 + R2) / R2);

    return (int)(v_in * 100); // return in centivolts (e.g., 12.34V → 1234)
}