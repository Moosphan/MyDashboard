export function primaryPair(hex: string, dark: boolean) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => parseInt(channel, 16))
  const background = dark ? rgb.map((channel) => Math.round(channel + (255 - channel) * 0.6)) : rgb
  const foreground = dark ? rgb.map((channel) => Math.round(channel * 0.2)) : [255, 255, 255]
  return { background, foreground }
}

export function contrastRatio(background: number[], foreground: number[]) {
  const luminance = (color: number[]) => {
    const linear = color.map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  const values = [luminance(background), luminance(foreground)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}
