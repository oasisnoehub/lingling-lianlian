import { Router } from 'express'

const router = Router()

interface AmapResponse {
  status?: string
  locations?: string
  regeocode?: {
    formatted_address?: string
    pois?: Array<{ name?: string }>
  }
}

function getCoordinate(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max
    ? coordinate
    : undefined
}

async function requestAmap(url: URL): Promise<AmapResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error' })
    if (!response.ok) throw new Error('AMAP_REQUEST_FAILED')
    return await response.json() as AmapResponse
  } finally {
    clearTimeout(timeout)
  }
}

router.get('/reverse', async (req, res) => {
  const latitude = getCoordinate(req.query.latitude, -90, 90)
  const longitude = getCoordinate(req.query.longitude, -180, 180)

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: '经纬度参数无效，请检查定位权限后重试' })
  }

  const key = process.env.AMAP_KEY
  if (!key) {
    return res.status(503).json({ error: '服务器未配置地图服务，暂时无法获取详细地址' })
  }

  try {
    const convertUrl = new URL('https://restapi.amap.com/v3/assistant/coordinate/convert')
    convertUrl.search = new URLSearchParams({
      key,
      locations: `${longitude},${latitude}`,
      coordsys: 'gps',
      output: 'JSON',
    }).toString()

    const converted = await requestAmap(convertUrl)
    if (converted.status !== '1' || !converted.locations) {
      return res.status(502).json({ error: '坐标转换失败，请稍后重新定位' })
    }

    const [convertedLongitude, convertedLatitude] = converted.locations.split(',').map(Number)
    if (
      !Number.isFinite(convertedLatitude)
      || !Number.isFinite(convertedLongitude)
      || convertedLatitude < -90
      || convertedLatitude > 90
      || convertedLongitude < -180
      || convertedLongitude > 180
    ) {
      return res.status(502).json({ error: '坐标转换结果无效，请稍后重新定位' })
    }

    const reverseUrl = new URL('https://restapi.amap.com/v3/geocode/regeo')
    reverseUrl.search = new URLSearchParams({
      key,
      location: `${convertedLongitude},${convertedLatitude}`,
      extensions: 'all',
      output: 'JSON',
    }).toString()

    const reverse = await requestAmap(reverseUrl)
    const address = reverse.regeocode?.formatted_address
    if (reverse.status !== '1' || !address) {
      return res.status(502).json({ error: '详细地址解析失败，请稍后重新定位' })
    }

    const nearestPoi = reverse.regeocode?.pois?.find(poi => typeof poi.name === 'string' && poi.name.trim())?.name
    return res.json({
      formatted_address: address,
      nearest_poi: nearestPoi,
      latitude: convertedLatitude,
      longitude: convertedLongitude,
    })
  } catch {
    return res.status(502).json({ error: '地图服务暂时不可用，请稍后重试' })
  }
})

export default router
