#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "nvs_flash.h"
#include "inc/pins_config.h"
#include "inc/voltageSensor.h"
#include "inc/currentSensor.h"
#include "inc/mqtt.h"

// ── Battery Specifications ──────────────────────────────────────────────────
// Panasonic NCR18650B: 3.6V nominal, 3350 mAh, 15A max discharge
#define BATTERY_CAPACITY_MAH     3350

// ── Voltage Threshold ───────────────────────────────────────────────────────
// Switch to battery when main grid drops below 5V but battery is above 5V
// Values are in centivolts (5.00V = 500 centivolts)
#define VOLTAGE_SWITCH_THRESHOLD_CV  500   // 5.00V

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

    // Relay to physically switch power source (HIGH = battery, LOW = main grid)
    gpio_reset_pin(PIN_RELAY);                       
    gpio_set_direction(PIN_RELAY, GPIO_MODE_OUTPUT); 

    // Initialize Voltage Sensors
    voltageSensor_init(PIN_VOLTAGE_BATTERY); // Battery Voltage
    voltageSensor_init(PIN_VOLTAGE_MAIN);    // Main Source Voltage

    // Initialize Current Sensors
    currentSensor_init(PIN_CURRENT_ROOM1);   // Room 1 Current
    currentSensor_init(PIN_CURRENT_ROOM2);   // Room 2 Current

    // Initialize Battery Indicator LED (GPIO 27) and Status LED (GPIO 4)
    gpio_config_t io_conf = {
        .intr_type = GPIO_INTR_DISABLE,
        .mode = GPIO_MODE_OUTPUT,
        .pin_bit_mask = (1ULL << PIN_LED_BATTERY) | (1ULL << PIN_LED_STATUS),
        .pull_down_en = 0,
        .pull_up_en = 0
    };
    gpio_config(&io_conf);

    // Start MQTT after hardware init
    mqtt_start_app();

    while (1)
    {
        // Blink status LED
        gpio_set_level(PIN_LED_STATUS, 0);                  
        vTaskDelay(500 / portTICK_PERIOD_MS);           
        gpio_set_level(PIN_LED_STATUS, 1);                  
        vTaskDelay(500 / portTICK_PERIOD_MS);           

        // Read Voltage (in centivolts, e.g., 1234 = 12.34V)
        int v_batt_cv = read_voltageSensor(PIN_VOLTAGE_BATTERY);
        int v_main_cv = read_voltageSensor(PIN_VOLTAGE_MAIN);

        // Read Current (in milliamps, e.g., 1500 = 1.5A)
        int i_room1_ma = read_currentSensor(PIN_CURRENT_ROOM1);
        int i_room2_ma = read_currentSensor(PIN_CURRENT_ROOM2);
        int i_total_ma = i_room1_ma + i_room2_ma;

        // ── Determine Active Source ─────────────────────────────────────────
        // Switch to battery when main grid voltage drops below 5V
        // AND battery has enough voltage (above 5V) to supply power
        int battery_active = (v_main_cv < VOLTAGE_SWITCH_THRESHOLD_CV && v_batt_cv >= VOLTAGE_SWITCH_THRESHOLD_CV) ? 1 : 0;

        // Drive relay and indicator LED
        gpio_set_level(PIN_RELAY, battery_active);        // Relay: switch power source
        gpio_set_level(PIN_LED_BATTERY, battery_active);  // LED: indicate battery active

        // ── Battery Runtime Estimation ──────────────────────────────────────
        // Panasonic NCR18650B: 3350 mAh capacity
        // runtime (minutes) = (capacity_mAh / current_mA) * 60
        int battery_runtime_min = 0;
        if (battery_active && i_total_ma > 0) {
            battery_runtime_min = (int)((float)BATTERY_CAPACITY_MAH / (float)i_total_ma * 60.0);
        } else if (battery_active && i_total_ma == 0) {
            battery_runtime_min = 9999; // effectively unlimited when no load
        }

        // ── Send data via MQTT ──────────────────────────────────────────────
        mqtt_send_message_to_topic("battery_room/v_battery", v_batt_cv);
        mqtt_send_message_to_topic("battery_room/v_main", v_main_cv);
        mqtt_send_message_to_topic("battery_room/i_room1", i_room1_ma);
        mqtt_send_message_to_topic("battery_room/i_room2", i_room2_ma);
        mqtt_send_message_to_topic("battery_room/i_total", i_total_ma);
        mqtt_send_message_to_topic("battery_room/active_source", battery_active);
        mqtt_send_message_to_topic("battery_room/battery_hours", battery_runtime_min);

        printf("Battery Room: v_batt=%d v_main=%d i_r1=%d i_r2=%d i_total=%d active=%d runtime=%dmin\n",
               v_batt_cv, v_main_cv, i_room1_ma, i_room2_ma, i_total_ma, battery_active, battery_runtime_min);
    }
}