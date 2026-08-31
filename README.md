# Smart Hospital MEDex 🏥🩺

Welcome to the **Smart Hospital MEDex** project! This is a comprehensive, IoT-based smart healthcare system designed to monitor patients, manage hospital environments, and automate deliveries using robotics.

## 🌟 Key Features

1. **Smartwatch Patient Monitoring** ⌚
   - Real-time tracking of critical vitals: Heart Rate, SpO2 (Blood Oxygen), Temperature, Humidity, and GSR (Galvanic Skin Response).
   - Emergency alerts and battery monitoring.

2. **Smart Room Automation** 🚪
   - Environmental monitoring for multiple rooms (Temperature, Humidity, Light/LDR).
   - Safety sensors: Smoke/Gas (MQ2, MQ135), Flame, Rain, and Occupancy.
   - Remote control of room appliances (Fans, LEDs, Pumps).

3. **Autonomous Delivery Robot** 🤖
   - Automated routing between 'home', 'room1', and 'room2' for medicine and equipment delivery.
   - Real-time location tracking via MQTT.

4. **Power & Battery Management** 🔋
   - Centralized power room tracking.
   - Monitoring of battery voltage, main voltage, and current consumption across rooms.

5. **Centralized Web Dashboard** 💻
   - A modern React/Vite-based web application to view all sensor data, control room appliances, and track the robot.
   - Secure User Authentication (Login/Signup).

## 🏗️ Project Architecture

The system is built on a robust, decentralized architecture using MQTT for real-time communication:

- **Backend (`/backend`)**: Node.js & Express server bridging HTTP API requests and MQTT messages. It serves the frontend, handles authentication, and acts as the central brain.
- **Frontend (`/smartwatch_wepapp` / `/frontend`)**: React application providing a real-time dashboard for doctors and administrators.
- **Hardware/IoT Nodes**:
  - **ESP32 Microcontrollers**: Used in the rooms, battery management system (`/BatteryRoom`), and the robot.
  - **Sensors**: Diverse range of sensors publishing data to the local MQTT broker.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- An MQTT Broker (e.g., Mosquitto) running on port `1883`
- ESP-IDF or Arduino IDE for flashing the hardware nodes

### Installation & Running

1. **Clone the repository:**
   ```bash
   git clone https://gitlab.com/mohamed.montser123zz/Medex_montaser.git
   cd final_all
   ```

2. **Start the Backend Server:**
   ```bash
   cd backend/node
   npm install
   node main.js
   ```
   *The backend will automatically find your IP address, connect to the local MQTT broker, and serve the API on port 80.*

3. **Start the Frontend (Development Mode):**
   ```bash
   cd smartwatch_wepapp
   npm install
   npm run dev
   ```

4. **Flash the Hardware Nodes:**
   Navigate to the respective hardware folders (e.g., `/BatteryRoom`) and flash your ESP32 devices using your preferred build system (ESP-IDF CMake is set up in some folders).

## 📡 MQTT Topic Structure

The system uses a well-defined MQTT topic structure for seamless communication:
- `smartwatch/<metric>`: Patient vitals (e.g., `smartwatch/heart_rate`, `smartwatch/spo2`).
- `<room_name>/<sensor>`: Room environmental data (e.g., `room1/temp`, `room2/mq2`).
- `<room_name>/<device>/set`: Topic to change appliance state (e.g., `room1/fan/set`).
- `esp32/location`: Robot navigation tracking.
- `battery_room/#` & `power_room/#`: Power consumption metrics.

## 👥 Contributors
- **Mohamed Montaser**

---
*Developed with ❤️ for the future of smart healthcare.*
