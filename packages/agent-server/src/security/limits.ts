// límites de longitud de los guardrails (owasp llm01 y para cuidar los tokens de groq).
// el largo del mensaje del usuario ya lo limita el gateway con MAX_MESSAGE_CHARS
export const SECURITY_LIMITS = {
  // cada texto que viene de tmdb o google books (sinopsis, descripción)
  maxUntrustedStringChars: 1500,
  // cada argumento de texto que el llm le pasa a una herramienta
  maxToolArgChars: 200,
  // la respuesta final que se le manda a la widget
  maxOutputChars: 8000,
  // acciones open_url por respuesta (imdb + google books)
  maxActionsPerReply: 2,
} as const;
