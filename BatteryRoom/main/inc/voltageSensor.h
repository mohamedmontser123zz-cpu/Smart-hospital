
#ifndef __voltageSensor__h_
#define __voltageSensor__h_


#include "driver/gpio.h"

#define R1 30000 // Resistor R1 value in ohms
#define R2 7500 // Resistor R2 value in ohms


void voltageSensor_init(gpio_num_t gpio);
int read_voltageSensor(gpio_num_t gpio);

#endif