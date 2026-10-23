export interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}

export interface IPCChannel<TRequest = unknown, TResponse = unknown> {
  request: TRequest
  response: IPCResponse<TResponse>
}
