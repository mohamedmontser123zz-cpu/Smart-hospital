# Battery Room ESP32 Pin Assignments

This document outlines the GPIO pins used for sensors and indicators in the Battery Room.

## Voltage Sensors
- **Battery Voltage**: `GPIO 34` (ADC1_CH6)
- **Main Source Voltage**: `GPIO 35` (ADC1_CH7)
- **Room 1 Voltage**: `GPIO 32` (ADC1_CH4)
- **Room 2 Voltage**: `GPIO 33` (ADC1_CH5)

## Current Sensors (ACS712 30A)
- **Room 1 Current**: `GPIO 36` (ADC1_CH0)
- **Room 2 Current**: `GPIO 39` (ADC1_CH3)

## Indicators / Relays
- **Battery Active LED/Relay**: `GPIO 27`
- **Status LED (Blinking)**: `GPIO 4`
