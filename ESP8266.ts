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
 * HTTP
 ************************************************************************/
namespace ESP8266_IoT {


/**
 * Send a fully customizable HTTP request
 */
//% block="send HTTP request|host: %host|port: %port|verb: %verb|path: %path|data: %data"
export function sendCustomHttpRequest(
    host: string,
    port: number,
    verb: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    data: string = ""
) {
    // Prepare AT+HTTPCLIENT command
    // Format: AT+HTTPCLIENT=<method>,<SSL>,<URL>,<contentType>,<data>,<returnResponse>,<timeout>
    // method: 0=GET,1=POST,2=HEAD,3=PUT,4=DELETE
    let methodNumber = 0
    switch (verb) {
        case "GET": methodNumber = 0; break;
        case "POST": methodNumber = 1; break;
        case "PUT": methodNumber = 3; break;
        case "DELETE": methodNumber = 4; break;
    }

    let url = `http://${host}:${port}${path}`
    let cmd = `AT+HTTPCLIENT=${methodNumber},0,"${url}",0,"${data}",1`

    // Send command
    sendAT(cmd, 1000)
}

}
