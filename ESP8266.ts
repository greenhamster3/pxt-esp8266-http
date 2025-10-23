//% color=#0fbc11 icon="\uf1eb"
namespace ESP8266_IoT {

    type MsgHandler = {
        [key: string]: {
            [key: string]: any
        }
    }

    let wifi_connected = false;
    const msgHandlerMap: MsgHandler = {};

    /*
    * on serial received data
    */
    let strBuf = ""
    function serialDataHandler() {
        const str = strBuf + serial.readString();
        let splits = str.split("\n")
        if (str.charCodeAt(str.length - 1) != 10) {
            strBuf = splits.pop()
        } else {
            strBuf = ""
        }
        for (let i = 0; i < splits.length; i++) {
            let res = splits[i]
            Object.keys(msgHandlerMap).forEach(key => {
                if (res.includes(key)) {
                    if (msgHandlerMap[key].type == 0) {
                        msgHandlerMap[key].handler(res)
                    } else {
                        msgHandlerMap[key].msg = res;
                    }
                }
            })
        }
    }

    // write AT command with CR+LF ending
    export function sendAT(command: string, wait: number = 0) {
        serial.writeString(`${command}\u000D\u000A`)
        basic.pause(wait)
    }

    export function registerMsgHandler(key: string, handler: (res: string) => void) {
        msgHandlerMap[key] = {
            type: 0,
            handler
        }
    }

    export function removeMsgHandler(key: string) {
        delete msgHandlerMap[key]
    }

    export function waitForResponse(key: string, wait: number = 1000): string {
        let timeout = input.runningTime() + wait;
        msgHandlerMap[key] = {
            type: 1,
        }
        while (timeout > input.runningTime()) {
            if (msgHandlerMap[key] == null || msgHandlerMap[key] == undefined) {
                return null;
            } else if (msgHandlerMap[key].msg) {
                let res = msgHandlerMap[key].msg
                delete msgHandlerMap[key]
                return res
            }
            basic.pause(5);
        }
        delete msgHandlerMap[key]
        return null;
    }

    export function sendRequest(command: string, key: string, wait: number = 1000): string {
        serial.writeString(`${command}\u000D\u000A`)
        return waitForResponse(key, wait)
    }

    export function resetEsp8266() {
        sendRequest("AT+RESTORE", "ready", 2000) // restore to factory settings
        sendRequest("AT+RST", "ready", 2000) // rest
        // set to STA mode
        if (sendRequest("AT+CWMODE=1", "OK") == null) {
            sendRequest("AT+CWMODE=1", "OK")
        }
        // sendRequest("AT+SYSTIMESTAMP=1634953609130", "OK") // Set local timestamp.
        sendRequest(`AT+CIPSNTPCFG=1,8,"ntp1.aliyun.com","0.pool.ntp.org","time.google.com"`, "AT+CIPSNTPCFG", 3000)
    }

    /**
     * Initialize ESP8266 module
     */
    //% block="set ESP8266|RX %tx|TX %rx|Baud rate %baudrate"
    //% tx.defl=SerialPin.P8
    //% rx.defl=SerialPin.P12
    //% ssid.defl=your_ssid
    //% pw.defl=your_password weight=100
    export function initWIFI(tx: SerialPin, rx: SerialPin, baudrate: BaudRate) {
        serial.redirect(tx, rx, BaudRate.BaudRate115200)
        serial.setTxBufferSize(128)
        serial.setRxBufferSize(128)
        serial.onDataReceived(serial.delimiters(Delimiters.NewLine), serialDataHandler)
        resetEsp8266()
    }

    /**
     * connect to Wifi router
     */
    //% block="connect Wifi SSID = %ssid|KEY = %pw"
    //% ssid.defl=your_ssid
    //% pw.defl=your_pwd weight=95
    export function connectWifi(ssid: string, pw: string) {
        registerMsgHandler("WIFI DISCONNECT", () => wifi_connected = false)
        registerMsgHandler("WIFI GOT IP", () => wifi_connected = true)
        let retryCount = 3;
        while (true) {
            sendAT(`AT+CWJAP="${ssid}","${pw}"`) // connect to Wifi router
            pauseUntil(() => wifi_connected, 3500)
            if (wifi_connected == false && --retryCount > 0) {
                resetEsp8266()
            } else {
                break
            }
        };
    }

    /**
     * Warning: Deprecated.
     * Check if ESP8266 successfully connected to Wifi
     */
    //% block="Wifi connected %State" weight=70
    export function wifiState(state: boolean) {
        return wifi_connected === state
    }

}
/************************************************************************
 * MQTT
 ************************************************************************/
namespace ESP8266_IoT {

    export enum SchemeList {
        //% block="TCP"
        TCP = 1,
        //% block="TLS"
        TLS = 2
    }

    export enum QosList {
        //% block="0"
        Qos0 = 0,
        //% block="1"
        Qos1,
        //% block="2"
        Qos2
    }

    let mqtt_connected: boolean = false
    const mqtt_subHandlers: { [topic: string]: (message: string) => void } = {}
    const mqtt_subQos: { [topic: string]: number } = {}


    /*----------------------------------MQTT-----------------------*/
    /*
     * Set  MQTT client
     */
    //% subcategory=MQTT weight=30
    //% blockId=initMQTT block="Set MQTT client config|scheme: %scheme clientID: %clientID username: %username password: %password path: %path"
    export function setMQTT(scheme: SchemeList, clientID: string, username: string, password: string, path: string): void {
        sendAT(`AT+MQTTUSERCFG=0,${scheme},"${clientID}","${username}","${password}",0,0,"${path}"`, 1000)
    }

    /*
     * Connect to MQTT broker
     */
    //% subcategory=MQTT weight=25
    //% blockId=connectMQTT block="connect MQTT broker host: %host port: %port reconnect: $reconnect"
    export function connectMQTT(host: string, port: number, reconnect: boolean): void {
        registerMsgHandler("+MQTTDISCONNECTED", () => mqtt_connected = false)
        registerMsgHandler("+MQTTCONNECTED", () => mqtt_connected = true)
        registerMsgHandler("MQTTSUBRECV", (res) => {
            const recvStringSplit = res.split(",", 4)
            const topic = recvStringSplit[1].slice(1, -1)
            const message = recvStringSplit[3].slice(0, -1)
            mqtt_subHandlers[topic] && mqtt_subHandlers[topic](message)
        })
        let retryCount = 3
        do {
            sendAT(`AT+MQTTCONN=0,"${host}",${port},${reconnect ? 0 : 1}`)
            pauseUntil(() => mqtt_connected, 3500)
        } while (mqtt_connected == false && --retryCount > 0);
        Object.keys(mqtt_subQos).forEach(topic => {
            const qos = mqtt_subQos[topic]
            sendAT(`AT+MQTTSUB=0,"${topic}",${qos}`, 1000)
        })
    }

    /*
     * Check if ESP8266 successfully connected to mqtt broker
     */
    //% block="MQTT broker is connected"
    //% subcategory="MQTT" weight=24
    export function isMqttBrokerConnected() {
        return mqtt_connected
    }

    /*
     * send message
     */
    //% subcategory=MQTT weight=21
    //% blockId=sendMQTT block="publish %msg to Topic:%topic with Qos:%qos"
    //% msg.defl=hello
    //% topic.defl=topic/1
    export function publishMqttMessage(msg: string, topic: string, qos: QosList): void {
        sendAT(`AT+MQTTPUB=0,"${topic}","${msg}",${qos},0`, 1000)
    }

    /*
     * disconnect MQTT broker
     */
    //% subcategory=MQTT weight=15
    //% blockId=breakMQTT block="Disconnect from broker"
    export function breakMQTT(): void {
        removeMsgHandler("MQTTSUBRECV")
        removeMsgHandler("+MQTTDISCONNECTED")
        removeMsgHandler("+MQTTCONNECTED")
        sendAT("AT+MQTTCLEAN=0", 500)
    }

    //% block="when Topic: %topic have new $message with Qos: %qos"
    //% subcategory=MQTT weight=10
    //% draggableParameters
    //% topic.defl=topic/1
    export function MqttEvent(topic: string, qos: QosList, handler: (message: string) => void) {
        mqtt_subHandlers[topic] = handler
        mqtt_subQos[topic] = qos
    }

}

/************************************************************************
 * thingspeak
 ************************************************************************/
namespace ESP8266_IoT {

    const THINGSPEAK_HOST = "api.thingspeak.com"
    const THINGSPEAK_PORT = "80"

    let thingspeak_connected: boolean = false
    let thingSpeakDatatemp = ""

    /**
     * Connect to ThingSpeak
     */
    //% block="connect thingspeak"
    //% write_api_key.defl=your_write_api_key
    //% subcategory="ThingSpeak" weight=90
    export function connectThingSpeak() {
        thingspeak_connected = true
    }

    /**
     * Connect to ThingSpeak and set data.
     */
    //% block="set data to send ThingSpeak | Write API key = %write_api_key|Field 1 = %n1||Field 2 = %n2|Field 3 = %n3|Field 4 = %n4|Field 5 = %n5|Field 6 = %n6|Field 7 = %n7|Field 8 = %n8"
    //% write_api_key.defl=your_write_api_key
    //% expandableArgumentMode="enabled"
    //% subcategory="ThingSpeak" weight=85
    export function setData(write_api_key: string, n1: number = 0, n2: number = 0, n3: number = 0, n4: number = 0, n5: number = 0, n6: number = 0, n7: number = 0, n8: number = 0) {
        thingSpeakDatatemp = "AT+HTTPCLIENT=2,0,\"http://api.thingspeak.com/update?api_key="
            + write_api_key
            + "&field1="
            + n1
            + "&field2="
            + n2
            + "&field3="
            + n3
            + "&field4="
            + n4
            + "&field5="
            + n5
            + "&field6="
            + n6
            + "&field7="
            + n7
            + "&field8="
            + n8
            + "\",,,1"
    }

    /**
     * upload data. It would not upload anything if it failed to connect to Wifi or ThingSpeak.
     */
    //% block="Upload data to ThingSpeak"
    //% subcategory="ThingSpeak" weight=80
    export function uploadData() {
        sendRequest(thingSpeakDatatemp, "http", 2000)
        basic.pause(200)
    }

    /*
     * Check if ESP8266 successfully connected to ThingSpeak
     */
    //% block="ThingSpeak connected %State"
    //% subcategory="ThingSpeak" weight=65
    export function thingSpeakState(state: boolean) {
        return thingspeak_connected === state
    }

}


/************************************************************************
 * smart_iot
 ************************************************************************/
namespace ESP8266_IoT {

    export enum SmartIotSwitchState {
        //% block="on"
        on = 1,
        //% block="off"
        off = 2
    }

    let smartiot_connected: boolean = false
    let smartiot_sendMsg: string = ""
    let smartiot_lastSendTime: number = 0
    let smartiot_switchListenFlag: boolean = false
    let smartiot_switchStatus: boolean = false
    let smartiot_host: string = "http://www.smartiot.space"
    let smartiot_port: string = "8080"
    let smartiot_token: string = ""
    let smartiot_topic: string = ""

    const SmartIotEventSource = 3100
    const SmartIotEventValue = {
        switchOn: SmartIotSwitchState.on,
        switchOff: SmartIotSwitchState.off
    }

    export function setSmartIotAddr(host: any, port: any) {
        smartiot_host = host
        smartiot_port = port
    }

    function concatReqMsg(queryString: string): string {
        return `AT+HTTPCLIENT=2,0,\"${smartiot_host}:${smartiot_port}${queryString}\",,,1`;
    }

    /* ----------------------------------- smartiot ----------------------------------- */
    /*
     * Connect to smartiot
     */
    //% subcategory=SmartIoT weight=50
    //% blockId=initsmartiot block="Connect SmartIoT with userToken: %userToken topic: %topic"
    export function connectSmartiot(userToken: string, topic: string): void {
        smartiot_token = userToken
        smartiot_topic = topic
        for (let i = 0; i < 3; i++) {
            let ret = sendRequest(concatReqMsg(`/iot/iotTopic/getTopicStatus/${userToken}/${topic}`), '"code":200', 2000);
            if (ret != null) {
                smartiot_connected = true
                if (ret.includes('switchOn')) {
                    smartiot_switchStatus = true
                    return
                }
            }
            smartiot_connected = (ret != null)
        }

    }

    /**
     * save the data to be sent to SmartIoT
     */
    //% subcategory=SmartIoT weight=48
    //% blockId=setSmartIotUploadData block="set data to send SmartIoT |Data 1 = %n1||Data 2 = %n2|Data 3 = %n3|Data 4 = %n4|Data 5 = %n5|Data 6 = %n6|Data 7 = %n7|Data 8 = %n8"
    export function setSmartIotUploadData(
        n1: number = 0,
        n2: number = 0,
        n3: number = 0,
        n4: number = 0,
        n5: number = 0,
        n6: number = 0,
        n7: number = 0,
        n8: number = 0
    ): void {
        smartiot_sendMsg = concatReqMsg(
            `/iot/iotTopicData/addTopicData?userToken=${smartiot_token}&topicName=${smartiot_topic}`
            + "&data1=" + n1
            + "&data2=" + n2
            + "&data3=" + n3
            + "&data4=" + n4
            + "&data5=" + n5
            + "&data6=" + n6
            + "&data7=" + n7
            + "&data8=" + n8
        )
    }

    /**
     * upload data to smartiot
     */
    //% subcategory=SmartIoT weight=45
    //% blockId=uploadSmartIotData block="Upload data %data to SmartIoT"
    export function uploadSmartIotData(): void {
        if (!connectSmartiot) {
            return
        }
        basic.pause(smartiot_lastSendTime + 1000 - input.runningTime())
        sendAT(smartiot_sendMsg)
        smartiot_lastSendTime = input.runningTime();
    }

    /*
     * Check if ESP8266 successfully connected to SmartIot
     */
    //% block="SmartIot connection %State"
    //% subcategory=SmartIoT weight=35
    export function smartiotState(state: boolean) {
        return smartiot_connected == state;
    }

    //% block="When SmartIoT switch %vocabulary"
    //% subcategory=SmartIoT weight=30
    //% state.fieldEditor="gridpicker" state.fieldOptions.columns=2
    export function iotSwitchEvent(state: SmartIotSwitchState, handler: () => void) {
        if (state == SmartIotSwitchState.on) {
            registerMsgHandler('{"code":200,"msg":null,"data":"switchOn"}', () => {
                if (smartiot_connected && !smartiot_switchStatus) {
                    handler();
                }
                smartiot_switchStatus = true;
            })
        } else {
            registerMsgHandler('{"code":200,"msg":null,"data":"switchOff"}', () => {
                if (smartiot_connected && smartiot_switchStatus) {
                    handler();
                }
                smartiot_switchStatus = false;
            })
        }

        if (!smartiot_switchListenFlag) {
            basic.forever(() => {
                if (smartiot_connected) {
                    sendAT(concatReqMsg(`/iot/iotTopic/getTopicStatus/${smartiot_token}/${smartiot_topic}`));
                }
                basic.pause(1000)
            })
            smartiot_switchListenFlag = true
        }
    }

}

/************************************************************************
 * HTTP
 ************************************************************************/
namespace ESP8266_IoT {

    /*
     * http requests
     */
    //% subcategory=HTTP weight=8
    //% blockId=postHTTP block="post HTTP with| content type:%contentType url:%url transport type:%transportType data:%data"
export function postHTTP(
    contentType: string,
    url: string,
    transportType: string,
    data: string
): void {

    const sendST = `AT+HTTPCLIENT=,${contentType},"${url}",,,${transportType},"${data}"`;
    sendAT(sendST, 1000);
}


}

