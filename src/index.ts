import { Context, Schema, Service } from 'koishi'
import CryptoJS from 'crypto-js'

class SparkService extends Service {
  constructor(ctx: Context, public config: SparkService.Config) {
    super(ctx, "spark", true)
  }

  async getAuthorization(host: string) {
    const date = new Date().toString()
    const algorithm = 'hmac-sha256'
    const headers = 'host date request-line'
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v1.1/chat HTTP/1.1`
    const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, this.config.API_SECRET)
    const signature = CryptoJS.enc.Base64.stringify(signatureSha)
    const authorizationOrigin = `api_key="${this.config.API_KEY}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`
    const authorization = btoa(authorizationOrigin)
    return `authorization=${authorization}&date=${date}&host=${host}`
  }

  async chat(endpoint: string, params: SparkService.ChatBodyParameterChat, uid: string, messages: SparkService.ChatBodyMessage[]) {
    const host = endpoint.match(/wss?:\/\/([^\/]+)/)[1]
    const authorization = await this.getAuthorization(host)
    const wsUrl = endpoint + '?' + authorization
    this.logger.debug(wsUrl)
    const wsClient = this.ctx.http.ws(wsUrl)
    return new Promise((resolve, reject) => {
      let result = ""
      wsClient.on('open', () => {
        wsClient.send(JSON.stringify({
          header: {
            app_id: this.config.APP_ID,
            uid,
          },
          parameter: {
            chat: params,
          },
          payload: {
            message: {
              text: messages,
            },
          },
        } as SparkService.ChatBody))
      })
      wsClient.on('message', (data) => {
        const resp = JSON.parse(data.toString())
        this.logger.debug(resp)
        result += resp.payload.choices.text[0].content
        if (resp.header.status === 2 || resp.header.code !== 0) {
          wsClient.close()
        }
      })
      wsClient.on('error', (err) => {
        this.logger.debug(err)
        reject(err.message)
      })
      wsClient.on('close', () => {
        resolve(result || "响应为空")
      })
    })
  }
}

namespace SparkService {
  export interface Config {
    APP_ID: string
    API_KEY: string
    API_SECRET: string
  }

  export interface ChatBodyHeader {
    app_id: string
    uid: string
  }

  export interface ChatBodyParameterChat {
    domain: string
    temperature: number
    top_k: number
    max_tokens: number
  }

  export interface ChatBodyMessage {
    role: "user" | "assistant"
    content: string
  }

  export interface ChatBody {
    header: ChatBodyHeader
    parameter: {
      chat: ChatBodyParameterChat
    }
    payload: {
      message: {
        text: ChatBodyMessage[]
      }
    }
  }

  export const Config: Schema<Config> = Schema.object({
    APP_ID: Schema.string().required(),
    API_KEY: Schema.string().required(),
    API_SECRET: Schema.string().required(),
  })
}

declare module 'koishi' {
  interface Context {
    spark: SparkService
  }
}

export default SparkService
