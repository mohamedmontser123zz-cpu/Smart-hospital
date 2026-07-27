#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "nvs_flash.h"
#include "inc/voltageSensor.h"
#include "inc/currentSensor.h"
#include "inc/mqtt.h"

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND)
    {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }

    // Initialize MQTT (WiFi + MQTT connection)
    mqtt_init_app();

    gpio_reset_pin(GPIO_NUM_22);                       
    gpio_set_direction(GPIO_NUM_22, GPIO_MODE_OUTPUT); 

    // Initialize Voltage Sensors
    voltageSensor_init(GPIO_NUM_34); // Battery Voltage
    voltageSensor_init(GPIO_NUM_35); // Main Source Voltage

    // Initialize Current Sensors
    currentSensor_init(GPIO_NUM_36); // Room 1 Current
    currentSensor_init(GPIO_NUM_39); // Room 2 Current

    // Initialize Battery Indicator LED (GPIO 27)
    gpio_config_t io_conf = {
        .intr_type = GPIO_INTR_DISABLE,
        .mode = GPIO_MODE_OUTPUT,
        .pin_bit_mask = (1ULL << GPIO_NUM_27) | (1ULL << GPIO_NUM_4),
        .pull_down_en = 0,
        .pull_up_en = 0
    };
    gpio_config(&io_conf);

    // Start MQTT after hardware init
    mqtt_start_app();

    while (1)
    {
        gpio_set_level(GPIO_NUM_4, 0);                  
        vTaskDelay(500 / portTICK_PERIOD_MS);           
        gpio_set_level(GPIO_NUM_4, 1);                  
        vTaskDelay(500 / portTICK_PERIOD_MS);           

        // Read Voltage (in centivolts, e.g., 1234 = 12.34V)
        int v_batt_cv = read_voltageSensor(GPIO_NUM_34);
        int v_main_cv = read_voltageSensor(GPIO_NUM_35);

        // Read Current (in milliamps, e.g., 1500 = 1.5A)
        int i_room1_ma = read_currentSensor(GPIO_NUM_36);
        int i_room2_ma = read_currentSensor(GPIO_NUM_39);
        int i_total_ma = i_room1_ma + i_room2_ma;

        // Determine Active Source
        int battery_active = (v_batt_cv < v_main_cv) ? 1 : 0;
        gpio_set_level(GPIO_NUM_27, battery_active);

        // Send data via MQTT
        mqtt_send_message_to_topic("battery_room/v_battery", v_batt_cv);
        mqtt_send_message_to_topic("battery_room/v_main", v_main_cv);
        mqtt_send_message_to_topic("battery_room/i_room1", i_room1_ma);
        mqtt_send_message_to_topic("battery_room/i_room2", i_room2_ma);
        mqtt_send_message_to_topic("battery_room/i_total", i_total_ma);
        mqtt_send_message_to_topic("battery_room/active_source", battery_active);

        printf("Battery Room: v_batt=%d v_main=%d i_r1=%d i_r2=%d i_total=%d active=%d\n",
               v_batt_cv, v_main_cv, i_room1_ma, i_room2_ma, i_total_ma, battery_active);
    }
}