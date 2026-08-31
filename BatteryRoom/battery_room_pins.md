# Battery Room ESP32 Pin Assignments

This document outlines the GPIO pins used for sensors and indicators in the Battery Room.

## Voltage Sensors
- **Battery Voltage**: `GPIO 34` (ADC1_CH6)
- **Main Source Voltage**: `GPIO 35` (ADC1_CH7)

## Current Sensors (ACS712 30A)
- **Room 1 Current**: `GPIO 36` (ADC1_CH0)
- **Room 2 Current**: `GPIO 39` (ADC1_CH3)

## Indicators / Relays
- **Power Source Relay**: `GPIO 22` (HIGH = Battery, LOW = Main Grid)
- **Battery Active LED/Relay**: `GPIO 27`
- **Status LED (Blinking)**: `GPIO 4`

## Battery Specs
- **Cell**: Panasonic NCR18650B 3.6V 3350mAh 15A
- **Switchover Threshold**: 5.00V (switches to battery when main grid drops below 5V)
