# Coletor de inscritos (Windows PowerShell) para rodar DENTRO da rede do TCE, em qualquer PC, em segundo plano.
# Lê a API pública do painel da ESCON e envia para a API do controle de senhas; as páginas do site
# (resumo-cursos, resumo-total, lanches) leem de lá ao vivo. Não precisa instalar nada.
#
# Como usar (uma vez):
#   1. Baixe este arquivo (ex.: para C:\tce\coletor-inscritos.ps1).
#   2. Clique com o botão direito → "Executar com o PowerShell" (ou: powershell -ExecutionPolicy Bypass -File C:\tce\coletor-inscritos.ps1).
#   3. Na primeira vez ele pede o endereço da API do painel (com ?k=…) e o token do coletor, e guarda os dois em
#      %APPDATA%\tce-coletor\config.json (só neste computador). Depois fica repetindo a cada 15 minutos.
#   Para rodar sozinho ao ligar o PC: agende em "Agendador de Tarefas" → Ação: powershell -WindowStyle Hidden
#   -ExecutionPolicy Bypass -File C:\tce\coletor-inscritos.ps1 (gatilho "Ao fazer logon"). Ou deixe a janela aberta.
#   Parâmetros: -Once (envia uma vez e sai) · -IntervaloMin 10 (padrão 15) · -Reconfigurar (pede endereço e token de novo).
param([switch]$Once, [int]$IntervaloMin = 15, [switch]$Reconfigurar)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ApiSenhas = 'https://dev.gerenciahub.com.br/tce-senhas/api/inscritos'
$dir = Join-Path $env:APPDATA 'tce-coletor'; $cfgFile = Join-Path $dir 'config.json'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$cfg = $null
if ((Test-Path $cfgFile) -and -not $Reconfigurar) { try { $cfg = Get-Content $cfgFile -Raw | ConvertFrom-Json } catch { $cfg = $null } }
if (-not $cfg -or -not $cfg.painel -or -not $cfg.token) {
  Write-Host 'Configuração do coletor de inscritos (fica só neste computador).'
  $painel = Read-Host 'Endereço da API do painel da ESCON (https://servicos.tce.ap.gov.br/escon/admin/api/public/painel/oiapoque?k=...)'
  $tokenSec = Read-Host 'Token do coletor (INSCRITOS_TOKEN)' -AsSecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSec))
  $cfg = @{ painel = $painel.Trim(); token = $token.Trim() }
  ($cfg | ConvertTo-Json) | Set-Content -Path $cfgFile -Encoding UTF8
}
function Enviar {
  $quando = (Get-Date).ToString('dd/MM HH:mm:ss')
  try {
    $resp = Invoke-WebRequest -Uri $cfg.painel -Headers @{ Accept = 'application/json, text/html;q=0.8'; 'User-Agent' = 'Mozilla/5.0 (tce-na-comunidade/coletor-ps)' } -UseBasicParsing -TimeoutSec 40
    $corpo = [string]$resp.Content
    if ($corpo.TrimStart().StartsWith('{') -or $corpo.TrimStart().StartsWith('[')) { $payload = @{ json = $corpo; source = 'coletor-ps' } } else { $payload = @{ html = $corpo; source = 'coletor-ps' } }
    $body = [Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress -Depth 3))
    $r = Invoke-WebRequest -Uri $ApiSenhas -Method Post -ContentType 'application/json; charset=utf-8' -Headers @{ 'X-Token' = $cfg.token } -Body $body -UseBasicParsing -TimeoutSec 40
    $out = $r.Content | ConvertFrom-Json
    $sem = if ($out.semCorrespondencia) { ' · sem correspondência: ' + ($out.semCorrespondencia -join ' | ') } else { '' }
    Write-Host "$quando OK: $($out.cursos) turmas enviadas (painel $($out.painelInfo))$sem" -ForegroundColor Green
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match '401') { $msg = 'token inválido: rode de novo com -Reconfigurar' }
    Write-Host "$quando FALHA: $msg" -ForegroundColor Red
  }
}
Enviar
if ($Once) { exit 0 }
Write-Host "Repetindo a cada $IntervaloMin min. Deixe esta janela aberta (ou agende no Agendador de Tarefas). Ctrl+C para parar."
while ($true) { Start-Sleep -Seconds ($IntervaloMin * 60); Enviar }
