import { io } from 'socket.io-client'

// Same-origin: in dev the Vite proxy forwards /socket.io to the server;
// in production the server serves the built client itself.
export const socket = io()
