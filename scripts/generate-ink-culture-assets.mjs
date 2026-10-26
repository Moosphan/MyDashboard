import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(root, 'resources/visuals/traditional-culture')
const inkDirectory = join(destination, 'ink-wash')
mkdirSync(inkDirectory, { recursive: true })
mkdirSync(join(destination, 'demo'), { recursive: true })
const ink = '#343c36'
const mineral = '#526c61'
const earth = '#927252'
const rounded = (value) => Number(value.toFixed(2))
const sequence = (count, callback) =>
  Array.from({ length: count }, (_, index) => callback(index)).join('')

function randomSource(seed) {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function path(shape, opacity = 1, attributes = '') {
  return `<path d="${shape}" fill="${ink}" opacity="${opacity}" ${attributes}/>`
}

function group(id, content, attributes = '') {
  return `<g id="${id}" ${attributes}>${content}</g>`
}

function brush(points, width, opacity, random, dry = false) {
  const samples = []
  for (let segment = 0; segment < points.length - 1; segment++) {
    const before = points[Math.max(0, segment - 1)]
    const start = points[segment]
    const end = points[segment + 1]
    const after = points[Math.min(points.length - 1, segment + 2)]
    for (let step = 0; step < 10; step++) {
      const fraction = step / 10
      const square = fraction * fraction
      const cube = square * fraction
      samples.push(
        [0, 1].map(
          (axis) =>
            0.5 *
            (2 * start[axis] +
              (-before[axis] + end[axis]) * fraction +
              (2 * before[axis] - 5 * start[axis] + 4 * end[axis] - after[axis]) * square +
              (-before[axis] + 3 * start[axis] - 3 * end[axis] + after[axis]) * cube),
        ),
      )
    }
  }
  samples.push(points.at(-1))
  const sides = [[], []]
  samples.forEach((sample, index) => {
    const previous = samples[Math.max(0, index - 1)]
    const next = samples[Math.min(samples.length - 1, index + 1)]
    const distance = Math.hypot(next[0] - previous[0], next[1] - previous[1]) || 1
    const normal = [-(next[1] - previous[1]) / distance, (next[0] - previous[0]) / distance]
    const pressure = Math.pow(Math.sin((Math.PI * index) / (samples.length - 1)), 0.55)
    const radius = width * (0.08 + pressure * 0.43) * (0.7 + random() * 0.5)
    for (let side = 0; side < 2; side++) {
      const direction = side === 0 ? -1 : 1
      sides[side].push(
        `${rounded(sample[0] + normal[0] * radius * direction)},${rounded(sample[1] + normal[1] * radius * direction)}`,
      )
    }
  })
  return path(
    `M${sides[0].join('L')}L${sides[1].reverse().join('L')}Z`,
    opacity,
    `filter="url(#${dry ? 'dry' : 'edge'})"`,
  )
}

const definitions = `<defs>
  <filter id="edge" x="-12%" y="-18%" width="124%" height="136%"><feTurbulence type="fractalNoise" baseFrequency=".045 .12" numOctaves="3" seed="17" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3.8" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".32"/></filter>
  <filter id="wash" x="-15%" y="-18%" width="130%" height="136%"><feTurbulence type="fractalNoise" baseFrequency=".022 .037" numOctaves="3" seed="31" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="11" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1.1"/></filter>
  <filter id="pigment" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".055 .12" numOctaves="4" seed="79" result="noise"/><feColorMatrix in="noise" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .45 .45 .45 0 .18" result="grain"/><feComposite in="SourceGraphic" in2="grain" operator="in"/><feDisplacementMap in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter>
  <filter id="dry" x="-12%" y="-18%" width="124%" height="136%"><feTurbulence type="fractalNoise" baseFrequency=".25 .62" numOctaves="3" seed="41" result="noise"/><feColorMatrix in="noise" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.6 1.6 1.6 0 -1.7" result="grain"/><feComposite in="SourceGraphic" in2="grain" operator="in"/><feDisplacementMap in2="noise" scale="2.3" xChannelSelector="R" yChannelSelector="G"/></filter>
  <linearGradient id="mountain-ink" x1=".12" y1="0" x2=".75" y2="1"><stop stop-color="${mineral}" stop-opacity=".58"/><stop offset=".35" stop-color="${mineral}" stop-opacity=".38"/><stop offset=".72" stop-color="${earth}" stop-opacity=".16"/><stop offset="1" stop-color="${earth}" stop-opacity="0"/></linearGradient>
  <linearGradient id="distant-ink" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#697a7c" stop-opacity=".58"/><stop offset=".6" stop-color="#798786" stop-opacity=".25"/><stop offset="1" stop-color="#798786" stop-opacity="0"/></linearGradient>
  <linearGradient id="rock-shadow" x1="0" y1="0" x2=".9" y2=".8"><stop stop-color="${ink}" stop-opacity=".7"/><stop offset=".5" stop-color="${mineral}" stop-opacity=".28"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></linearGradient>
  <linearGradient id="rock-warm" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="${earth}" stop-opacity=".35"/><stop offset=".55" stop-color="${earth}" stop-opacity=".12"/><stop offset="1" stop-color="${earth}" stop-opacity="0"/></linearGradient>
  <linearGradient id="wall-ink"><stop stop-color="#c3b08b" stop-opacity=".92"/><stop offset=".32" stop-color="#dfc9a3" stop-opacity=".9"/><stop offset=".67" stop-color="#d8c29b" stop-opacity=".95"/><stop offset="1" stop-color="#a29373" stop-opacity=".9"/></linearGradient>
  <linearGradient id="roof-ink" x1=".2" y1="0" x2=".7" y2="1"><stop stop-color="#748074"/><stop offset=".48" stop-color="#4b5c50"/><stop offset="1" stop-color="#303d34"/></linearGradient>
  <linearGradient id="fog" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset=".58" stop-color="white"/><stop offset=".95" stop-color="black"/></linearGradient>
  <mask id="fade"><rect width="1600" height="1000" fill="url(#fog)"/></mask>
  <radialGradient id="bleed"><stop stop-color="${ink}" stop-opacity=".14"/><stop offset=".7" stop-color="${ink}" stop-opacity=".06"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></radialGradient>
</defs>`

function mountain(id, shape, opacity, random, marks = []) {
  const clip = `<clipPath id="${id}-clip"><path d="${shape}"/></clipPath>`
  let wrinkles = ''
  for (const [horizontal, vertical, length, slope] of marks) {
    const breadth = 26 + random() * 40
    const middle = horizontal + slope * 0.4
    const bottom = horizontal + slope
    const shadow = `M${horizontal} ${vertical}Q${horizontal - 19} ${vertical + length * 0.19} ${middle} ${vertical + length * 0.36}L${middle - 24} ${vertical + length * 0.49}Q${bottom - breadth} ${vertical + length * 0.74} ${bottom - breadth * 0.2} ${vertical + length}L${bottom + breadth * 0.7} ${vertical + length * 0.93}Q${middle + breadth} ${vertical + length * 0.45} ${horizontal + 12} ${vertical + length * 0.12}Z`
    wrinkles += `<path d="${shadow}" fill="url(#rock-shadow)" opacity=".65" filter="url(#wash)"/>`
    wrinkles += `<path d="M${horizontal + 9} ${vertical + 12}Q${horizontal + breadth * 1.4} ${vertical + length * 0.17} ${middle + breadth * 1.65} ${vertical + length * 0.55}L${bottom + breadth} ${vertical + length}L${middle + 5} ${vertical + length * 0.58}Z" fill="url(#rock-warm)" filter="url(#wash)"/>`
    wrinkles += sequence(33, () => {
      const progress = random() * 0.88
      const center = horizontal + slope * progress + Math.sin(progress * 8) * 12
      const offset = (random() - 0.42) * breadth * 1.5
      const top = vertical + progress * length
      const run = 15 + random() * 47
      const drift = (slope / length) * run + (random() - 0.5) * 27
      return brush(
        [
          [center + offset, top],
          [center + offset - 5 + drift * 0.4, top + run * 0.4],
          [center + offset + drift, top + run],
        ],
        3 + random() * 10,
        0.12 + random() * 0.26,
        random,
        true,
      )
    })
    wrinkles += sequence(11, () => {
      const progress = 0.1 + random() * 0.8
      const left = horizontal + slope * progress + (random() - 0.3) * breadth * 1.9
      const top = vertical + progress * length
      return brush(
        [
          [left - 6, top],
          [left + 9, top - 2],
          [left + 18 + random() * 9, top + 3],
        ],
        2 + random() * 3,
        0.15 + random() * 0.25,
        random,
        true,
      )
    })
    wrinkles += sequence(20, () => {
      const progress = random() * 0.92
      const left = horizontal + slope * progress + (random() - 0.5) * breadth * 2.1
      const top = vertical + progress * length
      return `<ellipse cx="${rounded(left)}" cy="${rounded(top)}" rx="${rounded(1 + random() * 3.3)}" ry="${rounded(1 + random() * 2.1)}" fill="${random() > 0.5 ? ink : mineral}" opacity="${rounded(0.13 + random() * 0.24)}" filter="url(#edge)"/>`
    })
  }
  return group(
    id,
    clip +
      `<g filter="url(#wash)"><path d="${shape}" fill="url(#${opacity < 0.3 ? 'distant-ink' : 'mountain-ink'})" filter="url(#pigment)"/></g><g clip-path="url(#${id}-clip)">${wrinkles}</g>`,
    `opacity="${opacity}" mask="url(#fade)"`,
  )
}

function birds(random, horizontal = 510, vertical = 300) {
  return group(
    'birds',
    sequence(3, (index) => {
      const left = horizontal + index * 42
      const top = vertical + (index % 2) * 17
      return brush(
        [
          [left - 13, top + 4],
          [left - 5, top],
          [left, top + 7],
          [left + 7, top + 2],
          [left + 17, top + 5],
        ],
        2.3,
        0.55,
        random,
      )
    }),
  )
}

function pine(horizontal, vertical, scale, random, prefix, opacity = 1) {
  let painting = path(
    'M-8 0 C14-53 32-132 14-207 C1-264 38-317 67-354 C42-289 27-259 43-204 C60-133 23-58 9 0Z',
    0.85,
    'filter="url(#edge)"',
  )
  painting += brush(
    [
      [5, -49],
      [-35, -112],
      [-77, -137],
      [-133, -158],
    ],
    8,
    0.75,
    random,
    true,
  )
  painting += brush(
    [
      [23, -142],
      [71, -189],
      [116, -197],
      [147, -218],
    ],
    9,
    0.8,
    random,
    true,
  )
  painting += brush(
    [
      [22, -233],
      [-22, -274],
      [-72, -279],
    ],
    8,
    0.75,
    random,
    true,
  )
  painting += brush(
    [
      [38, -281],
      [85, -319],
      [125, -324],
    ],
    7,
    0.75,
    random,
    true,
  )
  const crowns = [
    [-127, -168, 62],
    [-71, -145, 55],
    [-65, -284, 62],
    [2, -275, 47],
    [72, -329, 62],
    [132, -327, 46],
    [109, -207, 65],
    [160, -227, 52],
    [50, -354, 50],
  ]
  for (const [centerX, centerY, radius] of crowns) {
    painting += `<ellipse cx="${centerX}" cy="${centerY}" rx="${radius * 1.1}" ry="${radius * 0.39}" fill="url(#bleed)" filter="url(#wash)"/>`
    painting += sequence(42, () => {
      const angle = random() * Math.PI * 2
      const extent = Math.sqrt(random())
      const left = centerX + Math.cos(angle) * radius * extent
      const top = centerY + Math.sin(angle) * radius * 0.38 * extent
      return brush(
        [
          [left - 8 - random() * 10, top],
          [left + 2, top - 6 - random() * 7],
          [left + 12 + random() * 7, top - 1],
        ],
        3 + random() * 6,
        0.35 + random() * 0.5,
        random,
        true,
      )
    })
  }
  painting += sequence(7, () => {
    const start = -30 - random() * 200
    return brush(
      [
        [16 + random() * 13, start],
        [11 + random() * 14, start + 29],
        [3 + random() * 12, start + 51],
      ],
      1.8,
      0.4,
      random,
      true,
    )
  })
  return group(
    prefix,
    painting,
    `transform="translate(${horizontal} ${vertical}) scale(${scale})" opacity="${opacity}"`,
  )
}

function shore(random, prefix, horizontal, vertical, width, opacity = 0.6) {
  const shape = `M${horizontal} ${vertical}q${width * 0.15} -32 ${width * 0.3} -15t${width * 0.28} -6q${width * 0.25} -39 ${width * 0.42} 5q-${width * 0.3} 41 -${width} 16Z`
  let painting = path(shape, 0.32, 'filter="url(#wash)"')
  painting += brush(
    [
      [horizontal, vertical + 7],
      [horizontal + width * 0.28, vertical - 8],
      [horizontal + width * 0.56, vertical + 2],
      [horizontal + width * 0.84, vertical - 18],
      [horizontal + width, vertical - 10],
    ],
    13,
    0.7,
    random,
    true,
  )
  painting += sequence(42, () => {
    const left = horizontal + random() * width
    const top = vertical - 4 + random() * 28
    return brush(
      [
        [left, top],
        [left + 12 + random() * 20, top - 3],
        [left + 22 + random() * 30, top],
      ],
      2 + random() * 4,
      0.45,
      random,
      true,
    )
  })
  return group(prefix, painting, `opacity="${opacity}"`)
}

function inkRoof(center, top, width, height, random) {
  const left = center - width / 2
  const right = center + width / 2
  const shape = `M${left - 4} ${top + height - 5}Q${left + width * 0.15} ${top + height + 1} ${center - width * 0.2} ${top + 2}L${center + width * 0.17} ${top}Q${right - width * 0.15} ${top + height - 1} ${right + 4} ${top + height - 6}L${right - 4} ${top + height + 3}Q${center} ${top + height + 11} ${left + 3} ${top + height + 4}Z`
  let painting = `<path d="${shape}" fill="url(#roof-ink)" opacity=".87" filter="url(#edge)"/>`
  painting += `<path d="${shape}" fill="${mineral}" opacity=".16" filter="url(#wash)"/>`
  painting += brush(
    [
      [left - 5, top + height - 7],
      [left + width * 0.2, top + height + 2],
      [center, top + height + 6],
      [right - width * 0.16, top + height + 1],
      [right + 5, top + height - 8],
    ],
    3.6,
    0.73,
    random,
  )
  painting += sequence(11, (index) => {
    const fraction = (index + 1) / 12
    const start = center + (fraction - 0.5) * width * 0.34
    const end = left + fraction * width
    return `<path d="M${rounded(start)} ${top + 5}Q${rounded((start + end) / 2)} ${rounded(top + height * 0.65)} ${rounded(end)} ${top + height - 1}" fill="none" stroke="#b8b79a" stroke-opacity="${rounded(0.13 + random() * 0.2)}" stroke-width="${rounded(0.6 + random() * 0.7)}" filter="url(#dry)"/>`
  })
  painting += brush(
    [
      [center - width * 0.22, top + 2],
      [center, top],
      [center + width * 0.2, top + 1],
    ],
    2.4,
    0.7,
    random,
  )
  return painting
}

function tower(random) {
  let painting = ''
  const levels = [285, 329, 376, 426, 479, 536, 597]
  for (let level = 6; level >= 0; level--) {
    const top = levels[level]
    const width = 70 + level * 19
    const wallWidth = width * 0.71
    const left = 1030 - wallWidth / 2
    const right = 1030 + wallWidth / 2
    const wallTop = top + 22
    const wallBottom = level === 6 ? 668 : levels[level + 1] + 3
    let storey = `<path d="M${left + 3} ${wallTop}L${left - 1} ${wallBottom - 4}L${1030} ${wallBottom}L${right + 1} ${wallBottom - 4}L${right - 3} ${wallTop}Z" fill="url(#wall-ink)" filter="url(#edge)"/>`
    storey += path(
      `M${right - wallWidth * 0.21} ${wallTop + 1}L${right - 2} ${wallTop}L${right + 1} ${wallBottom - 4}L${right - wallWidth * 0.21} ${wallBottom - 1}Z`,
      0.19,
      'filter="url(#pigment)"',
    )
    storey += `<path d="M${left + wallWidth * 0.18} ${wallTop + 6}Q${left + wallWidth * 0.26} ${wallTop + 18} ${left + wallWidth * 0.2} ${wallBottom - 2}L${left + 2} ${wallBottom - 5}L${left + 4} ${wallTop + 5}Z" fill="${earth}" opacity=".18" filter="url(#wash)"/>`
    storey += brush(
      [
        [left + 3, wallTop + 5],
        [left + 1, wallBottom - 8],
        [1030, wallBottom - 3],
        [right, wallBottom - 8],
      ],
      1.6,
      0.46,
      random,
      true,
    )
    storey += brush(
      [
        [right - wallWidth * 0.21, wallTop + 4],
        [right - wallWidth * 0.21, wallBottom - 3],
      ],
      1.3,
      0.42,
      random,
      true,
    )
    const doorTop = wallTop + 11
    const doorWidth = 4.5 + level * 0.8
    storey += path(
      `M${1030 - doorWidth} ${wallBottom - 6}V${doorTop + 6}Q1030 ${doorTop - 3} ${1030 + doorWidth} ${doorTop + 6}V${wallBottom - 6}Z`,
      0.67,
      'filter="url(#edge)"',
    )
    if (level > 2) {
      for (const direction of [-1, 1]) {
        const windowCenter = 1030 + direction * wallWidth * 0.28
        storey += path(
          `M${windowCenter - 2} ${doorTop + 6}q3-4 5 0v11h-5Z`,
          0.39,
          'filter="url(#edge)"',
        )
      }
    }
    storey += sequence(9, () => {
      const horizontal = left + random() * wallWidth
      const vertical = wallTop + 9 + random() * 31
      return brush(
        [
          [horizontal, vertical],
          [horizontal + 4 + random() * 5, vertical + 1],
        ],
        0.7 + random(),
        0.17,
        random,
        true,
      )
    })
    storey += inkRoof(1030, top, width, 22 + level * 0.45, random)
    painting += group('pagoda-storey-' + (7 - level), storey)
  }
  painting += group(
    'pagoda-finial',
    brush(
      [
        [1030, 237],
        [1030, 264],
        [1030, 288],
      ],
      2.1,
      0.85,
      random,
    ) +
      sequence(5, (index) => {
        const top = 253 + index * 5
        const radius = 2 + index * 0.75
        return brush(
          [
            [1030 - radius, top],
            [1030, top - 1.1],
            [1030 + radius, top],
          ],
          1.7,
          0.75,
          random,
        )
      }) +
      path('M1022 284Q1030 275 1038 284Z', 0.75, 'filter="url(#edge)"'),
  )
  painting += group(
    'pagoda-stone-platform',
    `<path d="M950 663L1029 668L1110 663L1121 676L1029 683L939 676Z" fill="#b4a588" opacity=".76" filter="url(#edge)"/>` +
      `<path d="M939 676L1029 683L1121 676V686L1029 695L939 687Z" fill="${earth}" opacity=".3" filter="url(#edge)"/>` +
      brush(
        [
          [938, 675],
          [1029, 683],
          [1122, 675],
        ],
        2.5,
        0.55,
        random,
        true,
      ) +
      brush(
        [
          [936, 688],
          [1029, 697],
          [1125, 687],
        ],
        3,
        0.42,
        random,
        true,
      ) +
      sequence(4, (index) =>
        brush(
          [
            [1011 - index * 3, 684 + index * 4],
            [1030, 686 + index * 4],
            [1049 + index * 3, 684 + index * 4],
          ],
          1.6,
          0.5,
          random,
          true,
        ),
      ),
  )
  painting += shore(random, 'tower-foundation', 916, 705, 239, 0.68)
  return group('pagoda', painting)
}

function hall(center, top, width, random, prefix) {
  const left = center - width * 0.32
  let painting = `<path d="M${left} ${top + 71}H${center + width * 0.33}V${top + 147}H${left}Z" fill="url(#wall-ink)" filter="url(#wash)"/>`
  painting += sequence(6, (index) => {
    const column = left + 6 + index * width * 0.125
    return brush(
      [
        [column, top + 77],
        [column - 1, top + 113],
        [column + 1, top + 146],
      ],
      4 + random() * 3,
      0.7,
      random,
      true,
    )
  })
  painting += brush(
    [
      [center - 8, top + 102],
      [center, top + 99],
      [center + 7, top + 141],
    ],
    19,
    0.72,
    random,
    true,
  )
  painting += inkRoof(center, top + 19, width, 65, random)
  painting += inkRoof(center, top, width * 0.67, 37, random)
  painting += brush(
    [
      [center - width * 0.39, top + 151],
      [center, top + 155],
      [center + width * 0.4, top + 149],
    ],
    7,
    0.55,
    random,
    true,
  )
  return group(prefix, painting)
}

function landscape(random) {
  const far =
    'M150 692Q202 581 261 535Q285 450 323 463Q366 508 400 476Q447 384 482 380Q522 434 546 430Q575 348 609 335Q649 376 671 454Q695 401 734 421Q778 481 809 680Z'
  const rear =
    'M705 742Q739 602 770 547L785 507L806 487L823 455L838 434L854 429L868 454L885 465L901 423L916 403L920 373L938 349L946 318L965 309L976 331L998 344L1005 381L1027 420L1049 441L1071 422L1089 384L1103 369L1107 331L1126 312L1129 281L1146 265L1155 238L1169 235L1184 201L1201 208L1218 239L1222 272L1241 300L1245 334L1262 365L1277 375L1292 350L1310 339L1320 347L1329 374L1345 397L1347 425L1371 455L1387 505Q1428 574 1460 741L1480 789Z'
  const front =
    'M730 823Q764 741 797 696L806 668L829 650L838 622L856 617L870 629L887 654L906 647L919 610L928 592L931 556L951 537L955 504L976 485L979 456L996 448L1010 420L1025 412L1038 439L1058 455L1062 485L1081 509L1087 540L1104 547L1121 528L1135 505L1150 510L1164 532L1169 560L1190 578L1204 569L1215 550L1234 552L1250 577L1255 600L1274 620L1280 650L1304 678L1318 710L1340 730Q1387 786 1411 875Z'
  let painting = mountain('distant-range', far, 0.25, random)
  painting += mountain('rear-range', rear, 0.65, random, [
    [1185, 223, 344, -79],
    [1213, 275, 330, 47],
    [1137, 312, 279, -53],
    [986, 341, 276, -42],
    [1271, 412, 260, 53],
    [1339, 410, 264, 43],
    [847, 484, 195, -25],
  ])
  painting += mountain('near-range', front, 0.94, random, [
    [1019, 432, 317, -80],
    [1058, 474, 270, 29],
    [989, 523, 254, -58],
    [1158, 516, 265, 41],
    [1248, 589, 192, 56],
    [868, 657, 122, -32],
  ])
  painting += shore(random, 'left-bank', 125, 761, 475, 0.55)
  painting += pine(335, 762, 0.65, random, 'bank-pine', 0.65)
  painting += pine(272, 765, 0.43, random, 'small-pine', 0.43)
  painting += brush(
    [
      [652, 792],
      [674, 798],
      [705, 797],
      [721, 790],
    ],
    3.8,
    0.7,
    random,
  )
  painting += brush(
    [
      [684, 774],
      [684, 794],
    ],
    2.8,
    0.75,
    random,
  )
  painting += brush(
    [
      [674, 774],
      [681, 770],
      [689, 775],
    ],
    8,
    0.85,
    random,
  )
  painting += brush(
    [
      [692, 774],
      [726, 751],
    ],
    1.4,
    0.5,
    random,
  )
  painting += birds(random, 440, 376)
  return painting
}

function pagodaScene(random) {
  const range =
    'M180 777Q220 666 282 625Q330 517 385 554Q432 616 463 563Q507 476 553 503Q606 548 663 701L768 813Z'
  const behind =
    'M840 788Q881 570 923 509Q957 400 1008 426Q1051 444 1098 381Q1136 327 1171 364Q1249 442 1299 548Q1365 605 1420 802Z'
  let painting = mountain('left-distance', range, 0.23, random)
  painting += mountain('tower-distance', behind, 0.29, random, [
    [1147, 389, 302, -57],
    [1194, 453, 237, 34],
    [974, 476, 198, -27],
  ])
  painting += tower(random)
  painting += shore(random, 'foreground-bank', 270, 832, 740, 0.82)
  painting += pine(529, 815, 1.18, random, 'foreground-pine')
  painting += pine(407, 834, 0.69, random, 'companion-pine', 0.65)
  painting += birds(random, 759, 345)
  return painting
}

function templeScene(random) {
  const distance =
    'M170 770Q211 599 270 523Q315 403 359 448Q406 504 430 418Q459 307 508 291Q548 343 583 422Q613 367 654 426Q692 490 735 518Q782 503 834 582L915 794Z'
  const right =
    'M1021 801Q1067 608 1112 538Q1141 470 1178 507Q1205 558 1245 539Q1313 592 1378 772L1460 859Z'
  let painting = mountain('temple-distance', distance, 0.49, random, [
    [491, 340, 357, -71],
    [539, 395, 282, 51],
    [369, 494, 217, -51],
    [648, 482, 218, 36],
  ])
  painting += mountain('right-hill', right, 0.4, random, [
    [1150, 544, 211, -36],
    [1247, 596, 159, 35],
  ])
  painting += shore(random, 'temple-ground', 775, 748, 572, 0.6)
  painting += hall(1086, 538, 320, random, 'main-temple')
  painting += hall(878, 607, 161, random, 'side-temple')
  painting += brush(
    [
      [975, 754],
      [953, 778],
      [980, 803],
      [947, 843],
    ],
    13,
    0.16,
    random,
    true,
  )
  painting += pine(1321, 765, 0.83, random, 'temple-pine', 0.88)
  painting += shore(random, 'front-rock', 153, 865, 524, 0.85)
  painting += pine(367, 838, 1.05, random, 'near-pine', 0.95)
  painting += birds(random, 824, 345)
  return painting
}

function ripples(random, prefix, horizontal, vertical, width, count = 12) {
  return group(
    prefix,
    sequence(count, (index) => {
      const left = horizontal + random() * width
      const top = vertical + index * 9 + random() * 5
      return brush(
        [
          [left, top],
          [left + 18, top - 2],
          [left + 40 + random() * 70, top],
        ],
        1.2 + random() * 1.8,
        0.12 + random() * 0.15,
        random,
        true,
      )
    }),
  )
}

function boat(random, prefix, horizontal, vertical, scale, sail = false) {
  let painting = path('M-74-5Q-23 12 64-8L52 10Q-9 24-60 8Z', 0.82, 'filter="url(#edge)"')
  painting += `<path d="M-40-7Q-25-43 12-35Q34-29 38-5Z" fill="${earth}" opacity=".58" filter="url(#wash)"/>`
  painting += brush(
    [
      [-40, -7],
      [-24, -30],
      [0, -35],
      [23, -23],
      [38, -5],
    ],
    3,
    0.72,
    random,
    true,
  )
  painting += brush(
    [
      [41, -8],
      [45, -39],
      [51, -17],
    ],
    7,
    0.83,
    random,
  )
  painting += brush(
    [
      [48, -23],
      [86, 9],
    ],
    1.8,
    0.68,
    random,
  )
  if (sail) {
    painting += brush(
      [
        [-16, -7],
        [-17, -169],
      ],
      3,
      0.8,
      random,
    )
    painting += `<path d="M-22-157Q-75-123-66-54L-22-43Z" fill="#d0b88c" opacity=".85" filter="url(#edge)"/>`
    painting += `<path d="M-10-143Q16-113 22-55L-10-46Z" fill="${earth}" opacity=".3" filter="url(#wash)"/>`
    painting += sequence(4, (index) =>
      brush(
        [
          [-24, -63 - index * 24],
          [-49 - index * 3, -70 - index * 20],
        ],
        1.7,
        0.34,
        random,
        true,
      ),
    )
  }
  return group(prefix, painting, `transform="translate(${horizontal} ${vertical}) scale(${scale})"`)
}

function bridgeScene(random) {
  let painting = mountain(
    'bridge-distance',
    'M390 694Q442 541 495 550L537 498L574 521L609 461L643 453L679 503L719 523L764 485L799 512Q875 580 939 710Z',
    0.24,
    random,
  )
  painting += mountain(
    'bridge-hill',
    'M1035 704L1069 622L1094 595L1108 553L1133 540L1151 509L1180 493L1198 453L1221 440L1238 461L1262 468L1275 509L1306 532L1329 585L1354 602L1382 671L1434 773Z',
    0.62,
    random,
    [
      [1215, 468, 240, -52],
      [1250, 508, 188, 38],
    ],
  )
  painting += shore(random, 'bridge-left-bank', 212, 727, 390, 0.8)
  painting += shore(random, 'bridge-right-bank', 1070, 735, 311, 0.65)
  painting += group(
    'stone-bridge',
    `<path d="M505 724Q543 557 801 544Q1033 546 1108 726L1044 732Q1000 626 809 619Q626 619 571 734Z" fill="#a3997a" opacity=".72" filter="url(#edge)"/>` +
      brush(
        [
          [502, 712],
          [600, 602],
          [804, 571],
          [994, 614],
          [1109, 718],
        ],
        9,
        0.72,
        random,
        true,
      ) +
      brush(
        [
          [574, 731],
          [632, 653],
          [807, 619],
          [973, 655],
          [1047, 731],
        ],
        5,
        0.74,
        random,
        true,
      ) +
      sequence(17, (index) => {
        const fraction = index / 16
        const horizontal = 521 + fraction * 566
        const vertical = 566 + Math.pow((fraction - 0.5) * 2, 2) * 137
        return brush(
          [
            [horizontal, vertical],
            [horizontal - 1, vertical - 22],
          ],
          4.4,
          0.65,
          random,
          true,
        )
      }) +
      brush(
        [
          [520, 681],
          [609, 580],
          [803, 546],
          [998, 593],
          [1090, 683],
        ],
        4.3,
        0.58,
        random,
        true,
      ),
  )
  painting += pine(345, 726, 0.78, random, 'bridge-pine', 0.9)
  painting += boat(random, 'bridge-returning-boat', 825, 791, 1.15)
  painting += ripples(random, 'bridge-water', 532, 784, 507)
  painting += birds(random, 775, 366)
  return painting
}

function bamboo(random, prefix, horizontal, vertical, scale, lean = 0) {
  let painting = ''
  for (let section = 0; section < 7; section++) {
    const top = -section * 63
    painting += brush(
      [
        [0, top - 3],
        [2, top - 33],
        [0, top - 60],
      ],
      9 - section * 0.55,
      0.63,
      random,
    )
    painting += brush(
      [
        [-5, top - 61],
        [0, top - 63],
        [6, top - 61],
      ],
      2.7,
      0.85,
      random,
    )
  }
  for (const [branchX, branchY, direction] of [
    [-67, -162, -1],
    [74, -257, 1],
    [-62, -342, -1],
    [62, -409, 1],
  ]) {
    painting += brush(
      [
        [0, branchY + 45],
        [branchX * 0.65, branchY + 8],
        [branchX, branchY],
      ],
      2.8,
      0.76,
      random,
    )
    painting += sequence(9, (index) => {
      const left = branchX + (index % 3) * direction * 22 - direction * 10
      const top = branchY + Math.floor(index / 3) * 20 - 20
      const extent = 42 + random() * 28
      const drift = direction * (19 + random() * 27)
      return path(
        `M${left} ${top}Q${left + drift * 0.1} ${top - 13} ${left + drift} ${top - extent}Q${left + drift * 0.9} ${top - 8} ${left} ${top}Z`,
        0.4 + random() * 0.43,
        'filter="url(#edge)"',
      )
    })
  }
  return group(
    prefix,
    painting,
    `transform="translate(${horizontal} ${vertical}) rotate(${lean}) scale(${scale})"`,
  )
}

function gardenScene(random) {
  let painting = mountain(
    'garden-distance',
    'M651 759Q710 617 758 581L803 526L839 538L871 483L899 474L939 527L967 511Q1057 578 1119 755Z',
    0.22,
    random,
  )
  painting += group(
    'moon-gate-wall',
    `<path d="M597 425Q871 404 1174 436L1175 774L596 774ZM799 774L799 579A107 107 0 1 1 1013 579L1013 774Z" fill="#c2b18b" fill-rule="evenodd" opacity=".63" filter="url(#wash)"/>` +
      `<path d="M777 774V579A129 129 0 0 1 1035 579V774H1013V579A107 107 0 0 0 799 579V774Z" fill="${earth}" opacity=".43" filter="url(#edge)"/>` +
      brush(
        [
          [591, 426],
          [783, 412],
          [984, 416],
          [1181, 436],
        ],
        17,
        0.65,
        random,
        true,
      ) +
      brush(
        [
          [589, 436],
          [785, 425],
          [982, 429],
          [1181, 445],
        ],
        5,
        0.44,
        random,
        true,
      ),
  )
  painting += shore(random, 'garden-ground', 434, 794, 873, 0.5)
  painting += bamboo(random, 'garden-bamboo-far', 1224, 773, 0.82, 9)
  painting += bamboo(random, 'garden-bamboo-near', 1290, 801, 1.35, -11)
  painting += bamboo(random, 'garden-bamboo-middle', 1348, 785, 1.05, 5)
  painting += mountain(
    'garden-stone',
    'M370 845L389 782L416 771L424 726L449 708L459 671L485 662L497 681L508 707L527 711L545 750L536 776L569 802L586 860Z',
    0.87,
    random,
    [
      [480, 688, 152, -25],
      [516, 739, 93, 22],
    ],
  )
  painting += brush(
    [
      [908, 754],
      [930, 790],
      [896, 829],
      [956, 873],
    ],
    11,
    0.2,
    random,
    true,
  )
  return painting
}

function lotusLeaf(random, prefix, horizontal, vertical, scale, rotation = 0) {
  let painting = `<path d="M0 0C-19-56-112-90-121-36C-171-13-103 32-62 43C-4 88 102 49 119 6C156-43 82-90 43-63C14-83-10-47 0 0Z" fill="${mineral}" opacity=".57" filter="url(#wash)"/>`
  painting += `<path d="M0 0C-14-45-73-66-99-34Q-43-35-3 13Q44 57 101 12Q42 33 0 0Z" fill="${ink}" opacity=".23" filter="url(#pigment)"/>`
  painting += sequence(7, (index) => {
    const angle = index * 0.84 + 0.2
    return brush(
      [
        [0, 0],
        [Math.cos(angle) * 39, Math.sin(angle) * 24],
        [Math.cos(angle) * 101, Math.sin(angle) * 47],
      ],
      1.5,
      0.29,
      random,
      true,
    )
  })
  return group(
    prefix,
    painting,
    `transform="translate(${horizontal} ${vertical}) rotate(${rotation}) scale(${scale})"`,
  )
}

function lotusFlower(random, prefix, horizontal, vertical, scale) {
  let painting = ''
  for (const [angle, extent] of [
    [-53, 75],
    [49, 79],
    [-29, 99],
    [28, 103],
    [0, 118],
  ]) {
    painting += `<path d="M0 9Q-39-29 0-${extent}Q35-37 0 9Z" fill="${angle === 0 ? '#e1c4b1' : '#d2b5a0'}" opacity=".84" transform="rotate(${angle})" filter="url(#edge)"/>`
    painting += `<path d="M0 5Q-17-38 0-${extent - 8}Q-6-35 6 1Z" fill="#925c55" opacity=".21" transform="rotate(${angle})" filter="url(#wash)"/>`
  }
  painting += sequence(
    9,
    () =>
      `<ellipse cx="${rounded((random() - 0.5) * 28)}" cy="${rounded(3 + random() * 11)}" rx="1.8" ry="3.2" fill="${earth}" opacity=".85"/>`,
  )
  return group(prefix, painting, `transform="translate(${horizontal} ${vertical}) scale(${scale})"`)
}

function lotusScene(random) {
  let painting = ripples(random, 'lotus-water-far', 343, 671, 905, 17)
  for (const [index, horizontal, vertical, scale, rotation] of [
    [0, 1117, 606, 0.95, -8],
    [1, 848, 658, 1.4, 12],
    [2, 581, 716, 0.91, -22],
    [3, 1010, 795, 1.65, 5],
    [4, 1282, 736, 0.87, -9],
  ]) {
    painting += brush(
      [
        [horizontal - 24, 859],
        [horizontal + 10, vertical + 87],
        [horizontal, vertical],
      ],
      3.5,
      0.63,
      random,
      true,
    )
    painting += lotusLeaf(random, 'lotus-leaf-' + index, horizontal, vertical, scale, rotation)
  }
  painting += brush(
    [
      [709, 853],
      [733, 614],
      [718, 494],
    ],
    4,
    0.71,
    random,
  )
  painting += lotusFlower(random, 'lotus-open-flower', 718, 493, 1.02)
  painting += brush(
    [
      [1181, 845],
      [1216, 592],
      [1204, 461],
    ],
    3.2,
    0.66,
    random,
  )
  painting += lotusFlower(random, 'lotus-small-flower', 1204, 462, 0.63)
  painting += brush(
    [
      [1033, 803],
      [1030, 584],
      [990, 532],
    ],
    3,
    0.58,
    random,
    true,
  )
  painting += `<path d="M971 526Q984 509 1010 527L1003 539L983 542Z" fill="${earth}" opacity=".72" filter="url(#edge)"/>`
  painting += sequence(
    5,
    (index) =>
      `<ellipse cx="${980 + index * 5}" cy="${526 + (index % 2) * 2}" rx="1.9" ry="1.2" fill="${ink}" opacity=".68"/>`,
  )
  painting += group(
    'lotus-dragonfly',
    brush(
      [
        [1055, 386],
        [1081, 393],
        [1094, 403],
      ],
      2,
      0.73,
      random,
    ) +
      `<path d="M1076 393Q1038 356 1029 376Q1044 393 1076 393ZM1080 394Q1085 359 1103 369Q1102 384 1080 394Z" fill="${earth}" opacity=".29" filter="url(#edge)"/>`,
  )
  painting += ripples(random, 'lotus-water-near', 480, 839, 823, 6)
  return painting
}

function plumScene(random) {
  let painting = group(
    'plum-old-trunk',
    path(
      'M1231 882Q1250 843 1227 807Q1202 771 1196 729Q1190 681 1162 643Q1138 617 1127 583Q1106 558 1080 541Q1050 519 1044 492Q1080 512 1101 516Q1136 531 1148 566Q1161 597 1189 619Q1220 650 1223 696Q1225 745 1257 784Q1282 820 1286 855L1314 876Q1275 865 1255 889Z',
      0.86,
      'filter="url(#edge)"',
    ) +
      `<path d="M1240 856Q1261 839 1239 801Q1210 762 1204 715Q1202 669 1168 635L1140 583Q1157 628 1180 664Q1195 723 1207 765Q1242 822 1240 856Z" fill="${earth}" opacity=".54" filter="url(#pigment)"/>` +
      brush(
        [
          [1273, 870],
          [1244, 877],
          [1211, 882],
          [1187, 878],
        ],
        7,
        0.67,
        random,
        true,
      ) +
      brush(
        [
          [1262, 862],
          [1301, 881],
          [1334, 877],
        ],
        6,
        0.6,
        random,
        true,
      ) +
      brush(
        [
          [1249, 842],
          [1242, 815],
          [1216, 772],
          [1209, 727],
        ],
        3,
        0.4,
        random,
        true,
      ),
  )
  const branches = [
    {
      points: [
        [1175, 678],
        [1079, 633],
        [1000, 548],
        [887, 509],
        [806, 452],
        [704, 438],
      ],
      width: 15,
    },
    {
      points: [
        [1126, 570],
        [1101, 453],
        [1031, 398],
        [997, 323],
        [918, 273],
      ],
      width: 13,
    },
    {
      points: [
        [1184, 704],
        [1301, 643],
        [1331, 558],
        [1413, 505],
      ],
      width: 12,
    },
    {
      points: [
        [1007, 553],
        [1000, 488],
        [955, 447],
        [926, 376],
      ],
      width: 6,
    },
    {
      points: [
        [1078, 632],
        [960, 633],
        [883, 595],
        [773, 585],
      ],
      width: 7,
    },
    {
      points: [
        [1035, 401],
        [1124, 372],
        [1141, 309],
      ],
      width: 6,
    },
    {
      points: [
        [894, 513],
        [853, 543],
        [771, 512],
      ],
      width: 5,
    },
  ]
  painting += group(
    'plum-branches',
    branches.map(({ points, width }) => brush(points, width, 0.86, random, true)).join(''),
  )
  const flowers = [
    [719, 438],
    [778, 453],
    [826, 476],
    [875, 508],
    [941, 534],
    [978, 495],
    [945, 431],
    [930, 388],
    [919, 281],
    [973, 309],
    [1015, 364],
    [1082, 389],
    [1134, 327],
    [788, 586],
    [842, 598],
    [935, 627],
    [1284, 651],
    [1329, 580],
    [1378, 533],
    [1401, 512],
  ]
  painting += group(
    'plum-blossoms',
    flowers
      .map(([horizontal, vertical]) =>
        sequence(3, (cluster) => {
          const centerX = horizontal + (cluster - 1) * 18 + random() * 9
          const centerY = vertical + (random() - 0.5) * 31
          const size = 7 + random() * 3
          return (
            sequence(5, (petal) => {
              const angle = petal * Math.PI * 0.4
              return `<ellipse cx="${rounded(centerX + Math.cos(angle) * size * 0.7)}" cy="${rounded(centerY + Math.sin(angle) * size * 0.7)}" rx="${rounded(size * 0.7)}" ry="${rounded(size * 0.54)}" fill="${cluster === 0 ? '#c69783' : '#e9d8b5'}" opacity=".85" filter="url(#edge)"/>`
            }) +
            `<circle cx="${rounded(centerX)}" cy="${rounded(centerY)}" r="2" fill="#8c4836" opacity=".78"/>`
          )
        }),
      )
      .join(''),
  )
  painting += mountain(
    'plum-foot-stone',
    'M918 873L945 828L970 818L996 765L1019 751L1040 716L1058 719L1081 753L1119 772L1137 813L1176 839L1198 879Z',
    0.67,
    random,
    [
      [1045, 738, 129, -29],
      [1094, 789, 78, 31],
    ],
  )
  painting += shore(random, 'plum-ground', 792, 892, 608, 0.38)
  return painting
}

function palaceScene(random) {
  let painting = mountain(
    'palace-far-range',
    'M220 645L268 563L306 547L339 493L370 478L406 514L445 527L475 484L501 476L536 510Q603 560 672 694Z',
    0.22,
    random,
  )
  painting += group(
    'palace-stone-terraces',
    sequence(3, (index) => {
      const left = 521 - index * 28
      const top = 695 + index * 32
      const width = 775 + index * 56
      return (
        `<path d="M${left} ${top}L${left + width * 0.5} ${top + 8}L${left + width} ${top}V${top + 24}L${left + width * 0.5} ${top + 33}L${left} ${top + 24}Z" fill="${index === 1 ? '#b4a486' : '#c5b390'}" opacity=".76" filter="url(#edge)"/>` +
        brush(
          [
            [left, top],
            [left + width * 0.5, top + 8],
            [left + width, top],
          ],
          2.5,
          0.42,
          random,
          true,
        )
      )
    }),
  )
  painting += group(
    'palace-side-hall-left',
    hall(546, 565, 253, random, 'west-hall'),
    'opacity=".7"',
  )
  painting += group(
    'palace-side-hall-right',
    hall(1289, 558, 253, random, 'east-hall'),
    'opacity=".7"',
  )
  painting += group(
    'palace-main-wall',
    `<path d="M688 503H1162V701Q919 712 688 701Z" fill="url(#wall-ink)" filter="url(#edge)"/>` +
      `<path d="M717 586H1135V696H717Z" fill="#85584a" opacity=".55" filter="url(#wash)"/>` +
      sequence(9, (index) => {
        const horizontal = 700 + index * 55
        return `<path d="M${horizontal - 4} 574L${horizontal + 5} 575L${horizontal + 6} 698L${horizontal - 5} 700Z" fill="#835442" opacity=".86" filter="url(#edge)"/>`
      }) +
      sequence(5, (index) => {
        const left = 771 + index * 60
        return path(`M${left} 602H${left + 35}V687H${left}Z`, 0.57, 'filter="url(#edge)"')
      }),
  )
  painting += group(
    'palace-double-eaves',
    inkRoof(925, 367, 536, 76, random) + inkRoof(925, 445, 723, 131, random),
  )
  painting += group(
    'palace-center-steps',
    sequence(8, (index) =>
      brush(
        [
          [869 - index * 4, 709 + index * 11],
          [926, 711 + index * 11],
          [982 + index * 4, 709 + index * 11],
        ],
        3,
        0.42,
        random,
        true,
      ),
    ),
  )
  painting += shore(random, 'palace-foreground', 385, 845, 1070, 0.4)
  painting += pine(389, 805, 0.9, random, 'palace-left-pine', 0.88)
  painting += birds(random, 1262, 327)
  return painting
}

function gorgeScene(random) {
  let painting = mountain(
    'gorge-distance',
    'M616 703L658 590L690 551L706 497L733 474L757 418L776 411L803 437L829 474L864 455L895 407L920 399L946 441L975 478L997 543L1039 617L1076 730Z',
    0.24,
    random,
  )
  painting += mountain(
    'gorge-left-cliff',
    'M169 845L211 738L230 671L260 642L272 587L296 568L317 502L343 484L354 416L377 393L385 342L407 321L414 283L442 263L459 271L476 310L502 329L517 374L544 399L551 444L577 468L588 517L621 548L643 620L679 666L698 747L734 855Z',
    0.9,
    random,
    [
      [449, 293, 387, -87],
      [488, 351, 340, 35],
      [536, 435, 261, 54],
      [322, 535, 244, -45],
    ],
  )
  painting += mountain(
    'gorge-right-cliff',
    'M997 846L1030 749L1043 684L1070 653L1081 589L1103 569L1110 506L1136 485L1146 427L1176 407L1186 363L1212 344L1223 311L1248 309L1268 340L1277 381L1301 395L1314 451L1334 478L1349 546L1370 584L1385 654L1413 706L1443 834Z',
    0.75,
    random,
    [
      [1244, 338, 340, -61],
      [1293, 428, 283, 47],
      [1150, 501, 227, -37],
    ],
  )
  painting += pine(352, 771, 0.64, random, 'gorge-cliff-pine', 0.86)
  painting += boat(random, 'gorge-sailboat', 853, 770, 1.14, true)
  painting += boat(random, 'gorge-far-boat', 961, 676, 0.33, true)
  painting += ripples(random, 'gorge-water', 664, 789, 355, 11)
  painting += birds(random, 711, 315)
  return painting
}

const scenes = [
  {
    id: 'misty-mountains',
    name: '烟岚山水',
    subtitle: '远山含烟，一叶入江。',
    note: '青灰远山、淡赭坡面与短笔皴染相衬，山体根部消入留白，江面不另加底色。',
    draw: landscape,
    seed: 63,
  },
  {
    id: 'pagoda-pines',
    name: '松风古塔',
    subtitle: '塔隐山间，松声在纸。',
    note: '七层逐级收分，薄檐、连贯墙体与石台相接；灰绿屋面、淡赭塔身保留水墨轻重。',
    draw: pagodaScene,
    seed: 83,
  },
  {
    id: 'temple-in-mist',
    name: '云山古寺',
    subtitle: '山深藏寺，疏密有致。',
    note: '寺院融进山水，用墨色轻重与留白建立空间，建筑只保留必要识别。',
    draw: templeScene,
    seed: 107,
  },
  {
    id: 'bridge-returning-boat',
    name: '江桥归舟',
    subtitle: '一桥烟水，一棹归舟。',
    note: '低拱石桥横接两岸，疏松压住近景；桥洞与江面保持透明留白，适合行旅与水乡题材。',
    draw: bridgeScene,
    seed: 137,
  },
  {
    id: 'bamboo-moon-gate',
    name: '竹庭月门',
    subtitle: '竹影入庭，门藏远岫。',
    note: '淡赭园墙、通透月门与浓墨修竹形成虚实对照，门内借远山，适合园林与文人生活。',
    draw: gardenScene,
    seed: 163,
  },
  {
    id: 'lotus-pond',
    name: '荷塘清趣',
    subtitle: '风过荷叶，水留清香。',
    note: '灰绿荷叶以大块湿染铺开，藕粉花瓣只作少量设色，保留水面呼吸，适合节气与诗词。',
    draw: lotusScene,
    seed: 191,
  },
  {
    id: 'plum-blossom',
    name: '梅影疏香',
    subtitle: '老枝横斜，疏香在纸。',
    note: '老干转折以枯笔落墨，米白与淡胭脂花簇沿枝疏布；偏右构图给左侧正文留出空间。',
    draw: plumScene,
    seed: 223,
  },
  {
    id: 'palace-courtyard',
    name: '云阙重檐',
    subtitle: '重檐含翠，宫阙入云。',
    note: '灰绿重檐、赭红柱列和层叠台基建立宫阙秩序，以疏松与远岫软化对称，属于原创古建意象。',
    draw: palaceScene,
    seed: 251,
  },
  {
    id: 'gorge-sails',
    name: '峡江帆影',
    subtitle: '两岸青山，一帆入远。',
    note: '两岸峭壁夹出一线江面，近山淡赭、远峰青灰，大小帆影建立纵深，适合山河与交通题材。',
    draw: gorgeScene,
    seed: 283,
  },
]

for (const scene of scenes) {
  const painting = scene.draw(randomSource(scene.seed))
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-labelledby="${scene.id}-title ${scene.id}-desc"><title id="${scene.id}-title">${scene.name}</title><desc id="${scene.id}-desc">原创代码水墨意象：${scene.note}透明背景，不对应真实古迹。</desc>${definitions}${painting}</svg>`
  const prefixed = source
    .replace(/id="([^"]+)"/g, (_, id) => `id="${scene.id}-${id}"`)
    .replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${scene.id}-${id})`)
    .replace(
      /aria-labelledby="([^"]+)"/,
      (_, ids) =>
        `aria-labelledby="${ids
          .split(' ')
          .map((id) => scene.id + '-' + id)
          .join(' ')}"`,
    )
  writeFileSync(join(inkDirectory, scene.id + '.svg'), prefixed)
}

const paper = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".63" numOctaves="3" seed="29" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#paper)" opacity=".2"/></svg>')}`
const style = `*{box-sizing:border-box}body{margin:0;background:#dfc69c;color:#33392f;font-family:"Songti SC","STSong","SimSun",serif}body:before{content:"";position:fixed;inset:0;background:url("${paper}");opacity:.3;mix-blend-mode:multiply;pointer-events:none}main{max-width:1440px;padding:40px 64px 50px;margin:auto}header{display:flex;justify-content:space-between;align-items:center;padding-bottom:22px;border-bottom:1px solid #5b573c40}header>div{display:flex;align-items:center;gap:16px}.seal{display:inline-grid;place-content:center;background:#8c4836;color:#e8d1ab;padding:8px;font-size:18px;line-height:1.2;letter-spacing:.1em}header strong{font-size:22px;letter-spacing:.12em}header p{font-size:11px;color:#6c604a;letter-spacing:.12em;margin:5px 0 0}a{color:inherit;text-underline-offset:5px}a:focus-visible{outline:3px solid #8c4836;outline-offset:5px}.back{font:12px "PingFang SC",sans-serif;color:#6c604a}.intro{padding:38px 0 2px;display:flex;justify-content:space-between;gap:32px;align-items:end}.intro h1{font-size:44px;font-weight:500;letter-spacing:.08em;margin:0}.intro p{margin:0;font:13px/1.8 "PingFang SC",sans-serif;color:#746149;max-width:420px}.hero{position:relative;margin:0 0 18px;isolation:isolate}.hero img{display:block;width:100%;aspect-ratio:1.6;object-fit:contain}.inscription{position:absolute;top:18%;left:4%;writing-mode:vertical-rl;z-index:1}.inscription h2{font-weight:500;font-size:46px;letter-spacing:.2em;line-height:1.4;margin:0}.inscription p{font-size:15px;letter-spacing:.18em;margin:6px 16px 0 0;color:#6a624b}.inscription .stamp{display:block;width:25px;border:1.5px solid #8c4836;color:#8c4836;font-size:13px;line-height:1.15;letter-spacing:2px;padding:5px 3px;margin:20px 15px 0 0;writing-mode:horizontal-tb}.caption{display:flex;justify-content:space-between;align-items:baseline;gap:20px;padding:15px 0;border-top:1px solid #5b573c40}.caption h3{font-size:23px;font-weight:500;margin:0}.caption p{font:12px/1.7 "PingFang SC",sans-serif;color:#746149;margin:6px 0 0;max-width:570px}.downloads{font:11px "PingFang SC",sans-serif;display:flex;gap:18px;white-space:nowrap}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px;margin-top:38px}.grid article{min-width:0}.small-art{position:relative}.small-art img{display:block;width:100%;aspect-ratio:1.6}.small-art h2{position:absolute;top:18%;left:3%;font-size:24px;letter-spacing:.14em;font-weight:500;writing-mode:vertical-rl;margin:0}.grid .caption{display:block}.grid .downloads{margin-top:14px}.grid .caption p{max-width:490px}footer{border-top:1px solid #5b573c40;margin-top:32px;padding-top:18px;color:#746149;font:11px/1.8 "PingFang SC",sans-serif;display:flex;justify-content:space-between;gap:28px}footer p{margin:0}.edition{white-space:nowrap}@media(max-width:850px){main{padding:28px}.intro{display:block}.intro p{margin-top:16px}.intro h1{font-size:36px}.inscription h2{font-size:30px}.inscription p{font-size:12px}.inscription .stamp{display:none}.grid{gap:22px}.small-art h2{font-size:19px}.caption{display:block}.downloads{margin-top:14px}}@media(max-width:600px){main{padding:20px}.back{font-size:11px}header strong{font-size:18px}header p{letter-spacing:0;font-size:10px}.seal{font-size:15px;padding:6px}.grid{grid-template-columns:1fr}.intro h1{font-size:30px}.hero img{aspect-ratio:1.3}.inscription{top:13%;left:1%}.inscription h2{font-size:26px}.inscription p{display:none}footer{display:block}.edition{margin-top:14px}}`

const downloads = (scene) =>
  `<div class="downloads"><a href="../ink-wash/${scene.id}.svg" target="_blank">查看 SVG ↗</a><a href="../ink-wash/${scene.id}.png" download>透明 PNG ↓</a></div>`
const caption = (scene) =>
  `<div class="caption"><div><h3>${scene.name}</h3><p>${scene.note}</p></div>${downloads(scene)}</div>`
const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>墨入山河 · 九景水墨小集</title><style>${style}</style></head><body><main><header><div><span class="seal">墨入<br>山河</span><div><strong>纸上山河 · 水墨小集</strong><p>第四辑 / 青灰 · 淡赭 · 皴染 / 九景</p></div></div><a class="back" href="index.html#elements">查看上一版线描 ↗</a></header><section class="intro"><h1>山河之外，自有清趣。</h1><p>沿用青灰、淡赭与枯湿相间的墨色。<br>新增江桥、竹庭、荷塘、疏梅、宫阙与峡江六景。</p></section><section class="hero"><img src="../ink-wash/misty-mountains.svg" alt="浓淡层叠的山水，左岸松树与江面小舟"><div class="inscription"><h2>一江烟水<br>半卷云山</h2><p>山水有声 · 墨间有韵</p><span class="stamp">山河<br>意象</span></div>${caption(scenes[0])}</section><section class="grid">${scenes
  .slice(1)
  .map(
    (scene) =>
      `<article><div class="small-art"><img src="../ink-wash/${scene.id}.svg" alt="${scene.name}"><h2>${scene.subtitle}</h2></div>${caption(scene)}</article>`,
  )
  .join(
    '',
  )}</section><footer><p>代码原创水墨意象 · 透明 SVG / PNG · 不对应真实古迹或朝代复原<br>纸纹与题字仅用于展示，未烘焙进素材。九景可独立下载、缩放与组合。</p><p class="edition">第四辑 / 九景 / 2026</p></footer></main></body></html>`
writeFileSync(join(destination, 'demo/ink-study.html'), html)
writeFileSync(
  join(inkDirectory, 'catalog.json'),
  JSON.stringify(
    {
      version: 4,
      style: 'ink-wash',
      width: 1600,
      height: 1000,
      background: 'transparent',
      assets: scenes.map(({ id, name, note }) => ({
        id,
        name,
        note,
        svg: id + '.svg',
        png: id + '.png',
      })),
    },
    null,
    2,
  ) + '\n',
)
console.log(`Generated ${scenes.length} original ink-wash SVG scenes and demo/ink-study.html`)
