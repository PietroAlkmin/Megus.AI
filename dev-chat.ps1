# Helper de demo: manda uma mensagem do "paciente" pro Kaua via /dev/inbound.
# Uso:
#   .\dev-chat.ps1 "oi, agendei massagem e já paguei, como pego a nota?"
#   .\dev-chat.ps1 "Pietro Augusto Mota Alkmin, CPF 546.252.558-30"
#   .\dev-chat.ps1 -Kind image -MediaUrl "http://x/comprovante.jpg" "manda o comprovante"
# As respostas do Kaua aparecem no TERMINAL DO SERVIDOR (onde roda npm run dev).

param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Text,
  [string]$Kind = "text",
  [string]$MediaUrl,
  [string]$From = "5511988887777",
  [string]$To = "5511999999999"
)

$body = @{ from = $From; to = $To; kind = $Kind; text = $Text }
if ($MediaUrl) { $body.media = @{ mimetype = "image/jpeg"; url = $MediaUrl } }

Invoke-RestMethod -Uri "http://localhost:3000/dev/inbound" `
  -Method Post -ContentType "application/json" -Body ($body | ConvertTo-Json)

Write-Host ">> enviado. Veja a resposta do Kaua no terminal do servidor." -ForegroundColor Cyan
