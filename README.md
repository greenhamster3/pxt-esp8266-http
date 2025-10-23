# ESP8266_IoT package

ESP8266_IoT package is developed under the cooperation of [ELECFREAKS](https://www.elecfreaks.com/), [CLASSROOM](http://www.classroom.com.hk/) and [TINKERCADEMY](https://tinkercademy.com/) (and now me!!!)

This package uploads data to MQTT, ThingSpeak, SmartIoT through [ESP8266 serial wifi module](http://www.elecfreaks.com/estore/esp8266-serial-wifi-module.html) aswell as making HTTP POST requests (my addition)

![](https://github.com/greenhamster3/pxt-esp8266-http/blob/master/ESP8266.png)

## Basic usage

1. Open [Microsoft Makecode/microbit](https://pxt.microbit.org) and create a new project 
2. Search and add the url to this repo (https://github.com/greenhamster3/pxt-esp8266-http)
3. Use the `ESP8266` drawer in the editor to drag out and arrange the blocks
4. Click `Download` to move your program to the micro:bit


## Example

### set wifi
Set pin RX and pin TX for ESP8266 Serial Wifi Module, Baud rate: 115200.
```blocks
ESP8266_IoT.initwifi(SerialPin.P2, SerialPin.P8)
```

### connet wifi
Connectwifi，please fill in your ssid and your key.
```blocks
ESP8266_IoT.connectwifi("your ssid", "your key")
```

### connect thingspeak
Connect thingspeak IoT TCP server.
```blocks
ESP8266_IoT.connectthingspeak()
```

### set data to be send 
Set data to be sent. Firstly, you should fill in your write api key.
```blocks
ESP8266_IoT.tosendtext(
"your write api key",
0,
0,
0,
0,
0,
0,
0,
0
)
``` 

### senddata
Send data to thingspeak.
```blocks
ESP8266_IoT.senddata()
```
## HTTP POST
Use [the espressif documentation](https://docs.espressif.com/projects/esp-at/en/release-v2.3.0.0_esp8266/AT_Command_Set/HTTP_AT_Commands.html#parameters) for what to fill in the fields with.

## License

MIT


## Supported targets

* for PXT/microbit
(The metadata above is needed for package search.)

```package
esp8266=github:elecfreaks/pxt-esp8266iot
```



