#ifndef __currentSensor__h_
#define __currentSensor__h_

#include "driver/gpio.h"

// Initialize the current sensor on the specified GPIO pin
void currentSensor_init(gpio_num_t gpio);

// Read the current sensor and return current in milliAmperes (mA)
int read_currentSensor(gpio_num_t gpio);

#endif
