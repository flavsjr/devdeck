// Gera build/icon.ico (16–256 px) e build/icon.png (256 px) a partir dos SVGs em build/, usando o
// próprio Electron para renderizar (sem dependência nova). Rodar: npx electron scripts/make-icon.mjs
// O .ico gerado é commitado; só roda de novo quando a marca mudar.
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const buildDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
const SIZES = [16, 24, 32, 48, 64, 128, 256]
const svgFor = (size) => readFileSync(join(buildDir, size <= 24 ? 'icon-small.svg' : 'icon.svg'))

async function render(win, size) {
  const src = `data:image/svg+xml;base64,${svgFor(size).toString('base64')}`
  const html = `<html><body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await win.webContents.executeJavaScript('document.images[0].decode()')
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  return img.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

/** ICO com entradas PNG: cabeçalho de 6 bytes + 16 bytes por imagem + os PNGs. */
function toIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = 6 + 16 * pngs.length
  const dir = pngs.map(({ size, png }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([header, ...dir, ...pngs.map((p) => p.png)])
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true, zoomFactor: 1 } })
  const pngs = []
  for (const size of SIZES) pngs.push({ size, png: await render(win, size) })
  writeFileSync(join(buildDir, 'icon.ico'), toIco(pngs))
  writeFileSync(join(buildDir, 'icon.png'), pngs.at(-1).png)
  console.log(`build/icon.ico: ${SIZES.join(', ')} px`)
  app.quit()
})
