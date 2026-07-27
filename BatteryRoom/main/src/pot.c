#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_adc/adc_oneshot.h"
#include "driver/gpio.h"
#include "inc/pot.h"
static adc_oneshot_unit_handle_t adc1_handle;

// Map GPIO → ADC1 channel
static adc_channel_t gpio_to_adc_channel(gpio_num_t gpio)
{
    switch (gpio)
    {
        case GPIO_NUM_36: return ADC_CHANNEL_0;
        case GPIO_NUM_37: return ADC_CHANNEL_1;
        case GPIO_NUM_38: return ADC_CHANNEL_2;
        case GPIO_NUM_39: return ADC_CHANNEL_3;
        case GPIO_NUM_32: return ADC_CHANNEL_4;
        case GPIO_NUM_33: return ADC_CHANNEL_5;
        case GPIO_NUM_34: return ADC_CHANNEL_6;
        case GPIO_NUM_35: return ADC_CHANNEL_7;
        default: return -1; // invalid
    }
}



void pot_init(gpio_num_t gpio)
{
      adc_channel_t channel = gpio_to_adc_channel(gpio);

    adc_oneshot_unit_init_cfg_t init_config = {
        .unit_id = ADC_UNIT_1,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    adc_oneshot_new_unit(&init_config, &adc1_handle);

    adc_oneshot_chan_cfg_t config = {
        .bitwidth = ADC_BITWIDTH_12,
        .atten    = ADC_ATTEN_DB_12,
    };
    adc_oneshot_config_channel(adc1_handle, channel, &config);
}

int read_pot(gpio_num_t gpio)
{

    int value;
    adc_oneshot_read(adc1_handle, gpio_to_adc_channel(gpio), &value);
   // return (uint32_t)((value * 3300) / 4096);
    return value;
}
