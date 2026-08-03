export interface RealtimeChatMessage {
  id: string
  roomCode: string
  senderId: string
  senderNickname: string
  channel: 'lobby' | 'game'
  text: string
  sentAt: string
}

export interface RealtimeChatGateway {
  sendMessage: (
    roomCode: string,
    text: string,
  ) => Promise<RealtimeChatMessage>
  subscribeToMessages: (
    roomCode: string,
    onMessage: (message: RealtimeChatMessage) => void,
  ) => () => void
}

export type PlayerConnectionState =
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'forfeited'

export interface MatchPresenceGateway {
  sendHeartbeat: (roomCode: string) => Promise<void>
  subscribeToPlayerConnection: (
    roomCode: string,
    onStateChange: (state: PlayerConnectionState) => void,
  ) => () => void
  claimDisconnectWin: (roomCode: string) => Promise<void>
}
