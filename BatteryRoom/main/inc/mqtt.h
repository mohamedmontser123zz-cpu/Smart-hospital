#ifndef MQTT_H
#define MQTT_H

void mqtt_init_app(void);
void mqtt_start_app(void);
void mqtt_send_message_to_topic(const char* topic, int payload);

#endif // MQTT_H
