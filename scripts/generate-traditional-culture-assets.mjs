import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(root, 'resources/visuals/traditional-culture')
const palettes = {
  ochre: {
    name: '淡赭设色',
    ink: '#4b4033',
    fine: '#766047',
    wash: '#a58250',
    accent: '#8b4936',
    pale: '#d8bf94',
  },
  ink: {
    name: '焦墨线描',
    ink: '#443e34',
    fine: '#6b6253',
    wash: '#887b65',
    accent: '#51483a',
    pale: '#d3c5a7',
  },
  cinnabar: {
    name: '朱砂古印',
    ink: '#6c382c',
    fine: '#945a43',
    wash: '#ad7550',
    accent: '#8e3d2c',
    pale: '#d9b58b',
  },
}
const number = (value) => Number(value.toFixed(2))
const attributes = (values) =>
  Object.entries(values)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ')
const path = (shape, values = {}) => `<path d="${shape}" ${attributes(values)}/>`
const line = (x1, y1, x2, y2, values = {}) =>
  `<line x1="${number(x1)}" y1="${number(y1)}" x2="${number(x2)}" y2="${number(y2)}" ${attributes(values)}/>`
const ellipse = (cx, cy, rx, ry, values = {}) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${attributes(values)}/>`
const group = (id, content, values = {}) => `<g id="${id}" ${attributes(values)}>${content}</g>`
const range = (count, callback) =>
  Array.from({ length: count }, (_, index) => callback(index)).join('')

function roof(cx, top, width, height, prefix) {
  const left = cx - width / 2
  const right = cx + width / 2
  const outline = `M${left} ${top + height * 0.8} Q${left + width * 0.11} ${top + height * 0.9} ${cx - width * 0.2} ${top + 9} Q${cx} ${top - 4} ${cx + width * 0.2} ${top + 9} Q${right - width * 0.11} ${top + height * 0.9} ${right} ${top + height * 0.8} L${right - 8} ${top + height + 10} Q${cx} ${top + height * 1.12} ${left + 8} ${top + height + 10}Z`
  const tiles = range(Math.round(width / 18), (index) => {
    const fraction = (index + 1) / (Math.round(width / 18) + 1)
    const start = cx + (fraction - 0.5) * width * 0.39
    const end = left + 12 + fraction * (width - 24)
    return path(
      `M${number(start)} ${top + 12} Q${number(start * 0.36 + end * 0.64)} ${number(top + height * 0.69)} ${number(end)} ${number(top + height + 4 - Math.sin(fraction * Math.PI) * 5)}`,
      { stroke: 'var(--fine)', 'stroke-width': '.95', opacity: '.7' },
    )
  })
  return group(
    prefix,
    path(outline, { fill: 'var(--wash)', 'fill-opacity': '.18', 'stroke-width': '2.4' }) +
      tiles +
      path(
        `M${left + 5} ${top + height + 2} Q${cx} ${top + height * 1.08} ${right - 5} ${top + height + 2}`,
        { 'stroke-width': '2.7' },
      ) +
      line(cx - width * 0.21, top + 7, cx + width * 0.21, top + 7, { 'stroke-width': '3' }) +
      path(
        `M${left + 13} ${top + height * 0.88} q-19 -2 -21 -16 M${right - 13} ${top + height * 0.88} q19 -2 21 -16`,
        { 'stroke-width': '2' },
      ),
  )
}

function lattice(x, y, width, height, prefix) {
  return group(
    prefix,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="var(--wash)" fill-opacity=".12"/>` +
      range(Math.floor(width / 13), (index) =>
        line(x + 8 + index * 13, y + 3, x + 8 + index * 13, y + height - 3, {
          'stroke-width': '.85',
        }),
      ) +
      range(Math.floor(height / 18), (index) =>
        line(x + 3, y + 9 + index * 18, x + width - 3, y + 9 + index * 18, {
          'stroke-width': '.8',
        }),
      ),
  )
}

function terrace(cx, top, width, prefix) {
  const left = cx - width / 2
  return group(
    prefix,
    path(`M${left} ${top}H${left + width}L${left + width + 20} ${top + 32}H${left - 20}Z`, {
      fill: 'var(--pale)',
      'fill-opacity': '.3',
    }) +
      path(`M${left - 20} ${top + 32}V${top + 57}H${left + width + 20}V${top + 32}`, {
        'stroke-width': '2',
      }) +
      range(Math.floor(width / 42), (index) => {
        const offset = left + 12 + index * 42
        return line(offset, top + 33, offset + 8, top + 55, { opacity: '.4', 'stroke-width': '1' })
      }) +
      range(6, (index) => {
        const half = 54 + index * 8
        return path(
          `M${cx - half} ${top + index * 11}H${cx + half}L${cx + half + 8} ${top + (index + 1) * 11}`,
          { 'stroke-width': '1.5' },
        )
      }),
  )
}

function pagoda() {
  let drawing = ellipse(500, 730, 260, 17, {
    fill: 'var(--wash)',
    'fill-opacity': '.1',
    stroke: 'none',
  })
  drawing += group(
    'spire',
    line(500, 58, 500, 138, { 'stroke-width': '2.6' }) +
      range(5, (index) =>
        ellipse(500, 78 + index * 11, 5 + index * 2.4, 3, {
          fill: 'var(--accent)',
          'fill-opacity': '.35',
        }),
      ) +
      path('M483 136L500 111L517 136Z', { fill: 'var(--wash)', 'fill-opacity': '.24' }),
  )
  drawing += range(7, (index) => {
    const top = 144 + index * 76
    const width = 148 + index * 42
    const height = 31 + index * 3
    const wallWidth = width * 0.64
    const wallTop = top + height + 8
    let level = path(
      `M${500 - wallWidth / 2} ${wallTop}L${500 - wallWidth / 2 - 4} ${top + 87}H${500 + wallWidth / 2 + 4}L${500 + wallWidth / 2} ${wallTop}Z`,
      { fill: 'var(--pale)', 'fill-opacity': '.62' },
    )
    level += line(500 - wallWidth / 2 + 12, wallTop, 500 - wallWidth / 2 + 9, top + 84, {
      opacity: '.5',
      'stroke-width': '1',
    })
    level += path(
      `M487 ${top + 76}V${wallTop + 17}Q500 ${wallTop + 2} 513 ${wallTop + 17}V${top + 76}Z`,
      { fill: 'var(--accent)', 'fill-opacity': '.2', 'stroke-width': '1.3' },
    )
    if (index > 2)
      level += range(2, (windowIndex) =>
        lattice(
          500 + (windowIndex ? 1 : -1) * wallWidth * 0.27 - 12,
          wallTop + 10,
          24,
          Math.max(15, top + 75 - wallTop - 10),
          `window-${index}-${windowIndex}`,
        ),
      )
    level += roof(500, top, width, height, `eaves-${index + 1}`)
    level += range(2, (side) => {
      const anchor = 500 + (side ? 1 : -1) * (width / 2 - 7)
      return (
        line(anchor, top + height + 9, anchor, top + height + 22, { 'stroke-width': '1' }) +
        path(`M${anchor - 4} ${top + height + 27}q4 -12 8 0Z`, {
          fill: 'var(--accent)',
          'fill-opacity': '.3',
          'stroke-width': '1',
        })
      )
    })
    return group(`storey-${index + 1}`, level)
  })
  return (
    drawing +
    terrace(500, 711, 340, 'foundation') +
    group(
      'ground',
      path('M200 741Q270 735 326 744M655 747Q730 735 805 744M240 757L350 757M632 761L770 761', {
        'stroke-width': '1',
        opacity: '.5',
      }),
    )
  )
}

function hall(cx, top, width, prefix, doubleRoof = false) {
  const wallTop = top + width * 0.16
  const wallHeight = width * 0.3
  let content = path(
    `M${cx - width * 0.35} ${wallTop}H${cx + width * 0.35}V${wallTop + wallHeight}H${cx - width * 0.35}Z`,
    { fill: 'var(--pale)', 'fill-opacity': '.55' },
  )
  content += range(5, (index) => {
    const left = cx - width * 0.3 + index * width * 0.12
    return lattice(
      number(left),
      number(wallTop + width * 0.07),
      number(width * 0.085),
      number(wallHeight * 0.66),
      `${prefix}-lattice-${index}`,
    )
  })
  content += group(
    `${prefix}-columns`,
    range(6, (index) => {
      const column = cx - width * 0.33 + index * width * 0.132
      return (
        path(`M${column - 4} ${wallTop + 8}V${wallTop + wallHeight}H${column + 4}V${wallTop + 8}`, {
          fill: 'var(--accent)',
          'fill-opacity': '.5',
          'stroke-width': '1.2',
        }) +
        path(`M${column - 9} ${wallTop + wallHeight}h18v8h-18Z`, {
          fill: 'var(--wash)',
          'fill-opacity': '.3',
        })
      )
    }),
  )
  content += group(
    `${prefix}-brackets`,
    range(6, (index) => {
      const anchor = cx - width * 0.33 + index * width * 0.132
      return path(`M${anchor - 15} ${wallTop + 14}h30m-24 0v9h18v-9m-22 -7h26m-17 0v-6h8v6`, {
        'stroke-width': '1.3',
      })
    }),
  )
  content += line(cx - width * 0.35, wallTop + 38, cx + width * 0.35, wallTop + 38, {
    'stroke-width': '2',
  })
  content += roof(cx, top, width, width * 0.17, `${prefix}-roof`)
  if (doubleRoof) {
    content += path(
      `M${cx - width * 0.23} ${top + 24}V${top - 24}H${cx + width * 0.23}V${top + 24}`,
      { fill: 'var(--pale)', 'fill-opacity': '.55' },
    )
    content += roof(cx, top - width * 0.105, width * 0.72, width * 0.13, `${prefix}-upper-roof`)
  }
  return group(prefix, content)
}

function temple() {
  return (
    ellipse(500, 690, 400, 22, { fill: 'var(--wash)', 'fill-opacity': '.08', stroke: 'none' }) +
    group(
      'distant-ridge',
      path('M62 478Q98 455 143 476T240 466M780 470Q842 450 937 474', { opacity: '.3' }),
    ) +
    hall(180, 407, 280, 'west-hall') +
    hall(820, 407, 280, 'east-hall') +
    terrace(500, 621, 750, 'stone-platform') +
    hall(500, 292, 650, 'main-hall', true) +
    group(
      'plaque',
      `<rect x="454" y="438" width="92" height="30" fill="var(--accent)" fill-opacity=".28"/>` +
        path('M469 448h16m-8 -3v16m27 -13h24m-22 7h18', { 'stroke-width': '1.7' }),
    ) +
    group(
      'incense-vessel',
      path(
        'M467 650h66l-9 33h-48Zm10 33-6 17m52-17 6 17m-55-39q-25-10-15-22m65 22q25-10 15-22M491 644v-24m18 24v-24',
        { fill: 'var(--wash)', 'fill-opacity': '.2', 'stroke-width': '2' },
      ),
    ) +
    path('M110 710Q320 722 397 712M605 712Q750 725 910 711', { opacity: '.4' })
  )
}

function palace() {
  let rail = ''
  for (const side of [-1, 1]) {
    rail += group(
      `balustrade-${side === 1 ? 'east' : 'west'}`,
      range(8, (index) => {
        const anchor = 500 + side * (115 + index * 41)
        return path(
          `M${anchor - 4} 602v-40h8v40m-6 -43q-8 -6 2 -12q10 6 2 12M${anchor} 576h${side * 41}m${-side * 41} 12h${side * 41}`,
          { 'stroke-width': '1.3' },
        )
      }),
    )
  }
  return (
    group(
      'palace-haze',
      ellipse(500, 711, 451, 20, { fill: 'var(--wash)', 'fill-opacity': '.09', stroke: 'none' }),
    ) +
    terrace(500, 606, 830, 'lower-terrace') +
    terrace(500, 566, 730, 'upper-terrace') +
    hall(500, 241, 900, 'imperial-hall', true) +
    group(
      'central-gates',
      path('M463 432H537V560H463Z', {
        fill: 'var(--accent)',
        'fill-opacity': '.35',
        'stroke-width': '2',
      }) +
        line(500, 436, 500, 560, { 'stroke-width': '2' }) +
        range(7, (row) =>
          range(4, (column) =>
            ellipse(474 + column * 17, 448 + row * 15, 1.6, 1.6, {
              fill: 'var(--fine)',
              stroke: 'none',
            }),
          ),
        ),
    ) +
    rail +
    group(
      'ridge-ornaments',
      path('M288 153q-10-20 2-27q8 17 20 14M712 153q10-20-2-27q-8 17-20 14', {
        'stroke-width': '3',
      }),
    ) +
    group(
      'courtyard-lines',
      path('M96 702H391M609 702H904M198 730H385M615 730H803M357 745H643', {
        opacity: '.4',
        'stroke-width': '1',
      }),
    )
  )
}

function mountainRidge(points, base, prefix, opacity) {
  const outline = points
    .map(([horizontal, vertical], index) => `${index ? 'L' : 'M'}${horizontal} ${vertical}`)
    .join(' ')
  const shape = `${outline}L${points.at(-1)[0]} ${base}L${points[0][0]} ${base}Z`
  let detail = ''
  for (let index = 1; index < points.length - 1; index++) {
    const [horizontal, vertical] = points[index]
    const next = points[index + 1]
    detail += path(
      `M${horizontal} ${vertical + 6}Q${horizontal + 13} ${vertical + 55} ${number((horizontal + next[0]) / 2 + 8)} ${number((vertical + base) / 2)}T${horizontal + 35} ${base - 10}`,
      { 'stroke-width': '1.1', opacity: '.6' },
    )
    detail += range(5, (lineIndex) =>
      path(
        `M${horizontal + lineIndex * 7 - 18} ${vertical + 38 + lineIndex * 12}l${16 + lineIndex * 3} ${29 + lineIndex * 8}`,
        { 'stroke-width': '.7', opacity: '.65' },
      ),
    )
  }
  return group(
    prefix,
    path(shape, { fill: 'var(--wash)', 'fill-opacity': String(opacity), stroke: 'none' }) +
      path(outline, { 'stroke-width': '1.9' }) +
      detail,
    { opacity: String(0.38 + opacity * 2) },
  )
}

function mountains() {
  return (
    group(
      'sun',
      ellipse(779, 228, 65, 65, { fill: 'var(--accent)', 'fill-opacity': '.2', stroke: 'none' }),
    ) +
    mountainRidge(
      [
        [35, 470],
        [94, 412],
        [135, 428],
        [198, 328],
        [230, 364],
        [286, 267],
        [321, 285],
        [376, 177],
        [402, 211],
        [430, 198],
        [480, 285],
        [518, 261],
        [580, 372],
        [615, 335],
        [671, 392],
        [731, 300],
        [770, 327],
        [823, 258],
        [861, 299],
        [900, 289],
        [965, 427],
      ],
      610,
      'far-mountains',
      0.09,
    ) +
    mountainRidge(
      [
        [18, 572],
        [80, 526],
        [114, 542],
        [182, 441],
        [225, 484],
        [270, 427],
        [311, 465],
        [365, 366],
        [398, 386],
        [445, 479],
        [500, 448],
        [556, 527],
        [615, 485],
        [652, 511],
        [716, 424],
        [753, 452],
        [795, 391],
        [831, 416],
        [881, 521],
        [935, 477],
        [987, 555],
      ],
      675,
      'middle-mountains',
      0.16,
    ) +
    mountainRidge(
      [
        [0, 692],
        [89, 628],
        [140, 646],
        [188, 593],
        [231, 607],
        [285, 566],
        [317, 585],
        [378, 651],
        [443, 630],
        [503, 679],
        [561, 626],
        [602, 646],
        [654, 598],
        [702, 623],
        [755, 566],
        [793, 589],
        [852, 655],
        [912, 616],
        [1000, 687],
      ],
      748,
      'near-mountains',
      0.24,
    ) +
    group(
      'mist-ribbons',
      path(
        'M61 568Q212 553 371 570T705 568M236 617Q428 597 629 620T967 610M108 700Q303 684 491 703T864 701',
        { stroke: 'var(--pale)', 'stroke-width': '13', opacity: '.6' },
      ),
    ) +
    group(
      'water',
      path('M40 750Q218 735 342 749M589 758Q739 743 960 752M154 773H356M477 781H744', {
        'stroke-width': '1.2',
        opacity: '.45',
      }),
    ) +
    group(
      'birds',
      path('M678 155q10 -10 20 0q10 -10 20 0M728 180q7 -7 14 0q7 -7 14 0', {
        'stroke-width': '1.5',
        opacity: '.7',
      }),
    )
  )
}

function pine() {
  let drawing = group(
    'trunk',
    path(
      'M388 726Q439 594 462 481Q478 402 443 331Q422 291 445 238M423 718Q467 606 490 484Q509 397 473 326Q448 288 461 238M466 492Q386 450 309 386M481 443Q562 382 631 310M453 348Q386 310 331 279M481 395Q566 367 699 383',
      { 'stroke-width': '3', fill: 'var(--wash)', 'fill-opacity': '.14' },
    ),
  )
  drawing += group(
    'bark',
    range(15, (index) =>
      path(`M${420 + ((index * 4) % 40)} ${710 - index * 28}q${index % 2 ? 12 : -8} -12 4 -25`, {
        'stroke-width': '1',
        opacity: '.6',
      }),
    ),
  )
  const clusters = [
    [305, 372, 105],
    [338, 273, 107],
    [450, 235, 130],
    [610, 303, 130],
    [702, 378, 120],
    [562, 388, 100],
  ]
  drawing += group(
    'needles',
    clusters
      .map(([cx, cy, radius], clusterIndex) => {
        let foliage = path(
          `M${cx - radius} ${cy + 12}Q${cx - radius * 0.65} ${cy - 31} ${cx - radius * 0.25} ${cy - 20}Q${cx + 10} ${cy - 72} ${cx + radius * 0.45} ${cy - 24}Q${cx + radius} ${cy - 24} ${cx + radius} ${cy + 17}Z`,
          { fill: 'var(--wash)', 'fill-opacity': '.12', 'stroke-width': '1.2' },
        )
        foliage += range(15, (tuftIndex) => {
          const horizontal = cx - radius * 0.82 + tuftIndex * radius * 0.115
          const vertical = cy - Math.sin(tuftIndex * 0.8 + clusterIndex) * 16
          return range(5, (needle) =>
            line(
              horizontal,
              vertical + 9,
              horizontal + (needle - 2) * 7,
              vertical - 14 - Math.sin(tuftIndex + needle) * 7,
              { 'stroke-width': '.9', opacity: '.75' },
            ),
          )
        })
        return group(`canopy-${clusterIndex + 1}`, foliage)
      })
      .join(''),
  )
  return (
    drawing +
    group(
      'root-rocks',
      path('M258 735l42-31 44 9 42-29 31 39 45 7 29 21H257Zm58-17 12 15m58-43-9 35m72 11-24 6', {
        fill: 'var(--wash)',
        'fill-opacity': '.12',
        'stroke-width': '1.7',
      }),
    )
  )
}

function bridge() {
  let drawing = group(
    'water',
    path(
      'M49 637Q227 614 382 639T701 637T968 640M119 671Q320 653 479 673T878 670M219 710H408M569 703H781M95 729H253',
      { opacity: '.45', 'stroke-width': '1.4' },
    ),
  )
  drawing += group(
    'stone-arch',
    path('M112 580Q500 201 888 580L888 626H742Q500 344 258 626H112Z', {
      fill: 'var(--wash)',
      'fill-opacity': '.18',
      'stroke-width': '2.8',
    }) + path('M125 594Q500 223 875 594M249 617Q500 330 751 617', { 'stroke-width': '1.4' }),
  )
  drawing += group(
    'arch-stones',
    range(25, (index) => {
      const fraction = (index + 0.5) / 25
      const horizontal = 132 + fraction * 736
      const arch = Math.sin(fraction * Math.PI)
      return line(horizontal, 580 - arch * 182, 500 + (horizontal - 500) * 0.68, 622 - arch * 133, {
        'stroke-width': '1',
        opacity: '.65',
      })
    }),
  )
  drawing += group(
    'rail',
    range(17, (index) => {
      const horizontal = 122 + index * 47.25
      const vertical = 571 - Math.sin((index / 16) * Math.PI) * 184
      return path(
        `M${number(horizontal - 4)} ${number(vertical)}v-45h8v45m-4 -47q-8-6 0-12q8 6 0 12`,
        { fill: 'var(--pale)', 'fill-opacity': '.65', 'stroke-width': '1.4' },
      )
    }) + path('M121 526Q500 150 879 526M121 545Q500 168 879 545', { 'stroke-width': '1.5' }),
  )
  drawing += group(
    'riverbanks',
    path(
      'M40 622l50-25 46 20 46-7M802 620l58-18 39 11 64-22M62 612l-4-27m7 25 15-32M925 608l9-33m-4 27 18-15',
      { 'stroke-width': '1.5' },
    ),
  )
  return drawing
}

function moonGate() {
  let drawing = group(
    'garden-wall',
    path('M109 331H891V688H661A190 190 0 1 0 339 688H109Z', {
      fill: 'var(--wash)',
      'fill-opacity': '.13',
      'stroke-width': '2.2',
      'fill-rule': 'evenodd',
    }),
  )
  drawing += group(
    'circular-doorframe',
    path('M339 688A190 190 0 1 1 661 688M315 688A211 211 0 1 1 685 688', { 'stroke-width': '2.4' }),
  )
  drawing += group(
    'wall-cap',
    path('M88 323Q161 308 238 318H762Q839 308 912 323L891 342H109Z', {
      fill: 'var(--accent)',
      'fill-opacity': '.18',
      'stroke-width': '2',
    }) +
      range(45, (index) =>
        line(108 + index * 17.5, 325, 114 + index * 17.5, 340, {
          'stroke-width': '.8',
          opacity: '.5',
        }),
      ),
  )
  drawing += group(
    'brickwork',
    range(8, (row) => {
      const vertical = 374 + row * 38
      return (
        line(119, vertical, 287, vertical, { opacity: '.28', 'stroke-width': '.8' }) +
        line(713, vertical, 881, vertical, { opacity: '.28', 'stroke-width': '.8' }) +
        range(3, (column) => {
          const horizontal = 135 + column * 62 + (row % 2) * 22
          return (
            line(horizontal, vertical, horizontal, vertical + 37, {
              opacity: '.3',
              'stroke-width': '.8',
            }) +
            line(1000 - horizontal, vertical, 1000 - horizontal, vertical + 37, {
              opacity: '.3',
              'stroke-width': '.8',
            })
          )
        })
      )
    }),
  )
  drawing += group(
    'bamboo',
    path(
      'M780 686Q758 561 784 405M804 689Q816 555 840 448M782 491l-45-29m43 57 44-28m-57 77-40-19m53-107 24-27',
      { 'stroke-width': '2' },
    ) +
      [
        [737, 462],
        [824, 491],
        [727, 549],
        [804, 415],
        [840, 448],
      ]
        .map(([horizontal, vertical], index) =>
          path(
            `M${horizontal} ${vertical}q${index % 2 ? 25 : -25} -38 ${index % 2 ? 46 : -42} -35q${index % 2 ? -9 : 8} 30 ${index % 2 ? -46 : 42} 35`,
            { fill: 'var(--fine)', 'fill-opacity': '.4', stroke: 'none' },
          ),
        )
        .join(''),
  )
  drawing += group(
    'paving',
    path(
      'M339 694H661M354 718H646M313 744H687M460 696l-28 48m108-48 28 48M169 709H281M716 709H854',
      { opacity: '.5', 'stroke-width': '1.3' },
    ),
  )
  return drawing
}

function clouds() {
  const cloud = (cx, cy, scale, prefix) =>
    group(
      prefix,
      path(
        'M-172 30C-226 30-226-28-181-30C-173-72-111-84-78-50C-32-103 51-70 56-24C96-46 145-23 144 10C204-1 213 49 168 57H-144C-194 57-194 3-153 3C-141-32-93-38-72-10C-27-50 27-30 30 10C60-3 83 10 83 29H-42C-70 29-72 7-58 1M-145 79H100M-85 99H43',
        { 'stroke-width': '2.1' },
      ),
      { transform: `translate(${cx} ${cy}) scale(${scale})` },
    )
  return (
    cloud(368, 321, 1.5, 'cloud-main') +
    cloud(740, 493, 0.87, 'cloud-east') +
    cloud(248, 604, 0.72, 'cloud-low') +
    group(
      'sun-disc',
      ellipse(700, 240, 65, 65, { fill: 'var(--accent)', 'fill-opacity': '.2', stroke: 'none' }),
    ) +
    group(
      'auspicious-trails',
      path('M456 570q50-24 115 0t155 0M103 454q44-18 88 0', {
        'stroke-width': '1.3',
        opacity: '.5',
      }),
    )
  )
}

const assets = [
  {
    id: 'pagoda',
    name: '古塔 · 层檐听风',
    category: '建筑',
    summary: '层檐、铃铎、塔身、台基独立分组',
    placement: '卷首右侧 / 章节标识',
    draw: pagoda,
  },
  {
    id: 'temple',
    name: '寺院 · 一檐清境',
    category: '建筑',
    summary: '重檐主殿、两侧配殿、香炉与石阶',
    placement: '建筑解读 / 页底主视觉',
    draw: temple,
  },
  {
    id: 'palace',
    name: '宫阙 · 重檐有序',
    category: '建筑',
    summary: '重檐屋顶、斗栱、柱列与台基栏杆',
    placement: '王朝主题 / 通栏插画',
    draw: palace,
  },
  {
    id: 'mountains',
    name: '山川 · 千岩叠翠',
    category: '山水',
    summary: '远、中、近三层山脊与留白云带',
    placement: '页底压景 / 章节过渡',
    draw: mountains,
  },
  {
    id: 'bridge',
    name: '石桥 · 一水相逢',
    category: '园林',
    summary: '拱券、砌石、栏杆与水纹独立分组',
    placement: '交流主题 / 横向点景',
    draw: bridge,
  },
  {
    id: 'moon-gate',
    name: '月洞 · 借景入画',
    category: '园林',
    summary: '月洞门、砖墙、竹叶与铺地',
    placement: '引文侧景 / 传统园林',
    draw: moonGate,
  },
  {
    id: 'pine',
    name: '古松 · 松风入卷',
    category: '植物',
    summary: '枝干、皴线与六簇针叶',
    placement: '页角装饰 / 题跋陪衬',
    draw: pine,
  },
  {
    id: 'clouds',
    name: '祥云 · 云起东方',
    category: '纹样',
    summary: '三组如意云与日轮，低密度装饰',
    placement: '标题陪衬 / 留白收束',
    draw: clouds,
  },
]

function svg(asset, palette, prefix = asset.id) {
  const colors = palettes[palette]
  const content = asset.draw().replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}-${id}"`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800" viewBox="0 0 1000 800" role="img" aria-labelledby="${prefix}-title ${prefix}-description" style="${Object.entries(
    colors,
  )
    .filter(([key]) => key !== 'name')
    .map(([key, value]) => `--${key}:${value}`)
    .join(
      ';',
    )}"><title id="${prefix}-title">${asset.name}</title><desc id="${prefix}-description">原创中国传统文化装饰意象，${colors.name}；透明背景，非具体历史建筑测绘或复原。</desc><g fill="none" stroke="var(--ink)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${content}</g></svg>`
}

const texture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".63" numOctaves="3" seed="29" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#paper)" opacity=".2"/></svg>')}`
const baseStyle = `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#dfc69c;color:#393126;font-family:"PingFang SC","Microsoft YaHei",sans-serif}body:before{content:"";position:fixed;inset:0;background:url("${texture}");opacity:.3;pointer-events:none;mix-blend-mode:multiply}h1,h2,h3,p{margin:0}h1,h2,h3{font-family:"Songti SC","STSong","SimSun",serif;font-weight:600}a{color:inherit;text-decoration-thickness:1px;text-underline-offset:5px}a:focus-visible{outline:3px solid #873b2a;outline-offset:6px}svg{display:block;width:100%;height:100%}.eyebrow{font-size:12px;letter-spacing:.18em;color:#744b36}.seal{display:inline-grid;place-items:center;background:#873b2a;color:#f0ddbd;width:40px;height:44px;font:20px "Songti SC",serif;letter-spacing:.08em}.rule{height:1px;background:#71583b55}.muted{color:#6a5640}.demo-disclaimer{font-size:12px;color:#69543e}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media(forced-colors:active){a:focus-visible{outline-color:Highlight}}`

function image(id, palette = 'ochre', className = '') {
  const asset = assets.find((item) => item.id === id)
  return `<img class="${className}" src="../${palette}/${id}.svg" alt="${asset.name}" data-asset="${id}">`
}

function frame(title, content, extraStyle, navigation = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 纸上山河</title><style>${baseStyle}${extraStyle}</style></head><body>${content}${navigation}</body></html>`
}

function gallery() {
  const content = `<main><header><div class="brand"><span class="seal">山河</span><div><strong>纸上山河</strong><p>中国传统文化 · 原创矢量绘画资源</p></div></div><p class="edition">初集 / 八景 · 三色 / 代码绘制</p></header><section class="hero"><div class="hero-copy"><p class="eyebrow">AN ATLAS OF CHINESE CULTURAL FORMS</p><h1>把山河古意，<br>留在纸上。</h1><p class="lead">以墨线为骨，以淡赭为韵。<br>让一座塔、一重檐、一片山，成为文字之外的余韵。</p><div class="hero-foot"><span>透明底 SVG</span><span>可缩放 · 可拆组 · 可换色</span></div></div>${image('mountains', 'ochre', 'hero-landscape')}${image('pagoda', 'ochre', 'hero-pagoda')}<span class="vertical-note">山川 · 宫阙 · 草木 · 人间</span></section><section class="collection"><div class="section-top"><div><p class="eyebrow">01 / THE ELEMENTS</p><h2>八景入卷</h2></div><p>点击画作查看原始 SVG；下方提供三种配色。</p></div><nav class="palette-nav" aria-label="插画配色">${Object.entries(
    palettes,
  )
    .map(
      ([id, palette]) =>
        `<a href="?palette=${id}#elements" data-palette="${id}">${palette.name}</a>`,
    )
    .join('')}</nav><div class="asset-grid" id="elements">${assets
    .map(
      (asset, index) =>
        `<article><a class="art-link" href="../ochre/${asset.id}.svg" data-source="${asset.id}" aria-label="放大查看${asset.name}"><span class="asset-order">${String(index + 1).padStart(2, '0')} / ${asset.category}</span>${image(asset.id)}<span class="view-note">查看 SVG ↗</span></a><div class="asset-caption"><h3>${asset.name}</h3><span>${asset.placement}</span></div><p class="asset-description">${asset.summary}</p><div class="asset-downloads">${Object.entries(
          palettes,
        )
          .map(
            ([id, palette]) =>
              `<a href="../${id}/${asset.id}.svg" download="${asset.id}-${id}.svg">${palette.name} SVG ↓</a>`,
          )
          .join('')}</div></article>`,
    )
    .join(
      '',
    )}</div></section><section class="applications"><div class="section-top"><div><p class="eyebrow">02 / IN COMPOSITION</p><h2>放进页面，才有章法</h2></div><p>四张 1920 × 1080 静态排版示例</p></div><div class="demo-grid">${[
    { id: 'cover', name: '卷首 · 塔与山川', note: '右侧主视觉，左侧留给标题' },
    { id: 'temple-study', name: '解读 · 一檐清境', note: '主体与注释分栏，避免插画抢字' },
    { id: 'palace-chapter', name: '章节 · 宫阙有序', note: '宫阙压景，屋檐成为叙事节奏' },
    { id: 'garden-quote', name: '题跋 · 园林留白', note: '月洞与古松，陪衬简短引文' },
  ]
    .map(
      (item) =>
        `<article><a href="${item.id}.html"><img src="${item.id}-preview.png" alt="${item.name}" width="960" height="540" loading="lazy"></a><h3><a href="${item.id}.html">${item.name} ↗</a></h3><p>${item.note}</p></article>`,
    )
    .join(
      '',
    )}</div></section><footer><div><span class="seal">原创</span><strong>图形为意象，叙事须有据。</strong></div><p>所有元素由本项目代码绘制；不对应具体古迹，不作为历史测绘或文物复原。<br>完整 SVG、色彩与图层说明见资源目录 README。</p><a href="../../../..//docs/design-system/traditional-culture-assets-research.md">绘图参考与研究记录 ↗</a></footer></main>`
  const style = `main{max-width:1440px;margin:auto;padding:42px 64px 50px}header{display:flex;align-items:center;justify-content:space-between;padding-bottom:30px;border-bottom:1px solid #70584360}.brand{display:flex;align-items:center;gap:16px}.brand strong{font-family:"Songti SC",serif;font-size:23px;letter-spacing:.12em}.brand p{font-size:11px;color:#6a5640;margin-top:5px;letter-spacing:.12em}.edition{font-size:11px;letter-spacing:.12em;color:#6a5640}.hero{height:650px;position:relative;isolation:isolate;border-bottom:1px solid #70584360}.hero-copy{position:relative;z-index:2;padding-top:92px;width:60%;pointer-events:none}.hero h1{font-size:80px;line-height:1.25;letter-spacing:.025em;margin-top:28px}.lead{font-size:16px;line-height:1.95;color:#654d3a;margin-top:28px}.hero-foot{display:flex;gap:24px;margin-top:36px;font-size:11px;color:#6b533b}.hero-landscape{position:absolute;right:-40px;bottom:0;width:77%;height:520px;object-fit:contain;opacity:.42;z-index:-1}.hero-pagoda{position:absolute;right:-75px;top:0;width:700px;height:650px;object-fit:contain;z-index:0}.vertical-note{position:absolute;right:6px;top:75px;writing-mode:vertical-rl;letter-spacing:.35em;font-family:"Songti SC",serif;color:#874634;font-size:16px}.section-top{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin:58px 0 28px}.section-top h2{font-size:34px;margin-top:14px}.section-top>p{font-size:12px;color:#6a5640}.palette-nav{display:flex;gap:30px;font-size:13px;margin-bottom:25px}.palette-nav a{padding-bottom:7px;text-decoration:none;border-bottom:2px solid transparent}.palette-nav a[aria-current=true]{color:#873b2a;border-bottom-color:#873b2a}.asset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:40px 32px}.art-link{height:355px;position:relative;display:block;border-top:1px solid #70584350;border-bottom:1px solid #70584350;background:linear-gradient(130deg,#f4e7cf44,transparent);overflow:hidden}.art-link img{width:100%;height:100%;object-fit:contain;padding:15px 20px 10px}.asset-order{position:absolute;top:17px;left:18px;font-size:10px;letter-spacing:.12em;color:#705843;z-index:1}.view-note{position:absolute;right:15px;bottom:13px;font-size:10px;color:#705843}.asset-caption{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:17px}.asset-caption h3{font-size:22px}.asset-caption span{font-size:11px;color:#6a5640}.asset-description{font-size:12px;color:#6a5640;margin-top:9px}.asset-downloads{display:flex;gap:18px;font-size:10px;color:#6a5640;margin-top:14px}.demo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:30px 32px}.demo-grid img{display:block;width:100%;height:auto;border:1px solid #70584340}.demo-grid h3{font-size:20px;margin-top:16px}.demo-grid h3 a{text-decoration:none}.demo-grid p{font-size:12px;color:#6a5640;margin-top:8px}footer{margin-top:64px;padding-top:30px;border-top:1px solid #70584360;display:grid;grid-template-columns:1fr auto;gap:18px}footer>div{display:flex;align-items:center;gap:16px}footer strong{font-family:"Songti SC",serif;font-size:21px;font-weight:500}footer p{font-size:11px;line-height:1.8;color:#6a5640;grid-column:1}footer>a{font-size:11px;grid-column:2;grid-row:2}@media(max-width:850px){main{padding:26px}.hero{height:540px}.hero h1{font-size:58px}.hero-copy{padding-top:65px}.hero-pagoda{right:-100px;width:550px;height:580px;opacity:.65}.hero-landscape{width:100%}.hero .lead{max-width:340px}.section-top{align-items:start;flex-direction:column}.asset-caption{display:block}.asset-caption span{display:block;margin-top:7px}.asset-downloads{flex-wrap:wrap}.art-link{height:290px}footer{display:block}footer p,footer>a{display:block;margin-top:18px}}@media(max-width:600px){header .edition{display:none}.hero h1{font-size:48px}.hero-copy{width:100%}.hero-pagoda{opacity:.23;right:-150px}.hero-landscape{opacity:.28}.hero-foot{flex-direction:column;gap:8px}.asset-grid,.demo-grid{grid-template-columns:1fr}.art-link{height:330px}.vertical-note{font-size:12px;right:0}.palette-nav{gap:20px}}`
  const script = `<script>const palette = new URLSearchParams(location.search).get('palette');const current = ['ink','cinnabar'].includes(palette) ? palette : 'ochre';for(const image of document.querySelectorAll('[data-asset]'))image.src='../'+current+'/'+image.dataset.asset+'.svg';for(const link of document.querySelectorAll('[data-source]'))link.href='../'+current+'/'+link.dataset.source+'.svg';for(const link of document.querySelectorAll('[data-palette]'))link.setAttribute('aria-current',String(link.dataset.palette===current));</script>`
  return frame(
    '传统文化 SVG 资源 · 展示稿',
    content.replace(
      '</header>',
      '</header><nav aria-label="绘画风格" style="padding-top:22px;font-size:14px"><a href="ink-study.html">水墨方向 · 浓淡晕染版 ↗</a></nav>',
    ),
    style + '.hero{overflow:hidden}.brand .seal{white-space:nowrap;flex-shrink:0}',
    script,
  )
}

const compositionStyle = `body{width:1920px;height:1080px;overflow:hidden}.page{position:relative;width:1920px;height:1080px;overflow:hidden}.page:after{content:"";position:absolute;inset:32px;border:1px solid #70584340;pointer-events:none}.masthead{position:absolute;left:100px;right:100px;top:68px;display:flex;align-items:center;gap:25px;font-size:20px;letter-spacing:.18em;color:#6a5640}.masthead .rule{flex:1}.masthead .seal{width:56px;height:60px;font-size:24px}.colophon{position:absolute;bottom:153px;left:100px;right:100px;display:flex;align-items:center;gap:25px;font-size:18px;color:#6a5640;letter-spacing:.12em}.colophon .rule{flex:1}.page .eyebrow{font-size:25px}.scene-art{position:absolute;object-fit:contain}.page h1{font-size:112px;line-height:1.25;letter-spacing:.03em;position:relative;z-index:2}.page p{position:relative;z-index:2}.scene-text{position:absolute;z-index:2}.page .demo-disclaimer{position:absolute;bottom:110px;left:100px;font-size:18px}.page h1,.page p{overflow-wrap:anywhere}.page .body-copy{font-size:34px;line-height:1.8;color:#654d3a}`
const masthead = `<div class="masthead"><span class="seal">山河</span><span>历史 · 文化 · 人间</span><span class="rule"></span><span>ILLUSTRATED IN CODE</span></div>`
const colophon = (name) =>
  `<div class="colophon"><span class="rule"></span><span>${name} / 纸上山河</span></div><p class="demo-disclaimer">原创意象插画 · 非具体古迹复原 / 静态排版展示稿</p>`

function composition(id) {
  if (id === 'cover')
    return frame(
      '卷首 · 塔与山川',
      `<main class="page">${masthead}${image('mountains', 'ochre', 'scene-art mountains')}${image('pagoda', 'ochre', 'scene-art pagoda')}<div class="scene-text"><p class="eyebrow">卷首 / 山川与人间</p><h1>山川有信，<br>人间有史。</h1><p class="body-copy">循一座古塔的檐影，<br>走近时间留下的形与意。</p></div><span class="vertical">一塔 · 一山 · 一卷人间</span>${colophon('卷首')}</main>`,
      compositionStyle +
        `.mountains{width:1350px;height:930px;right:-130px;bottom:-45px;opacity:.38}.pagoda{width:1020px;height:980px;right:-15px;top:5px}.scene-text{left:130px;top:262px;width:900px}h1{margin-top:35px}.body-copy{margin-top:45px}.vertical{position:absolute;right:105px;top:220px;writing-mode:vertical-rl;letter-spacing:.36em;color:#873b2a;font:32px "Songti SC",serif}`,
    )
  if (id === 'temple-study')
    return frame(
      '解读 · 一檐清境',
      `<main class="page">${masthead}<div class="scene-text title"><p class="eyebrow">建筑阅读 / 从轮廓到细节</p><h1>一檐之下，<br>读懂东方建筑。</h1></div>${image('temple', 'ochre', 'scene-art temple')}<div class="notes"><section><span>01 / 轮廓</span><h2>先看屋顶，再看整体</h2><p>以檐口的舒展与屋面的层次，<br>建立第一眼的建筑印象。</p></section><section><span>02 / 结构</span><h2>让柱与梁，成为阅读线索</h2><p>分开呈现柱列、梁枋与斗栱，<br>把繁复细节转为清晰的观察顺序。</p></section><section><span>03 / 章法</span><h2>插画有所止，文字有余地</h2><p>建筑落在页底，注释放在侧边。<br>让画面丰富，让说明仍然易读。</p></section></div>${colophon('解读')}</main>`,
      compositionStyle +
        `.title{left:112px;top:200px;width:1000px}.title h1{font-size:80px;margin-top:26px}.temple{width:1160px;height:600px;left:-10px;bottom:100px}.notes{position:absolute;right:115px;top:235px;width:620px;border-left:1px solid #70584366;padding-left:40px}.notes section{padding:0 0 20px;margin-bottom:20px;border-bottom:1px solid #70584355}.notes section:last-child{margin-bottom:0}.notes span{font-size:22px;color:#873b2a;letter-spacing:.12em}.notes h2{font-size:32px;margin-top:12px}.notes p{font-size:26px;line-height:1.6;color:#654d3a;margin-top:12px}`,
    )
  if (id === 'palace-chapter')
    return frame(
      '章节 · 宫阙有序',
      `<main class="page">${masthead}<div class="scene-text title"><p class="eyebrow">第二篇 / 建筑与秩序</p><h1>重檐之上，<br>宫阙的秩序。</h1></div><p class="chapter-note">以中轴建立视线，<br>以层次展开叙事。<br><span>一组建筑意象的页面排版实验</span></p>${image('palace', 'ochre', 'scene-art palace')}${colophon('章节')}</main>`,
      compositionStyle +
        `.title{left:125px;top:218px}.title h1{font-size:90px;margin-top:24px}.page .chapter-note{position:absolute;right:140px;top:252px;width:600px;font:36px/1.8 "Songti SC",serif;color:#654d3a;padding-left:40px;border-left:2px solid #873b2a88}.chapter-note span{font:20px/2 "PingFang SC",sans-serif;letter-spacing:.12em}.palace{width:1350px;height:610px;left:285px;bottom:110px}`,
    )
  return frame(
    '题跋 · 园林留白',
    `<main class="page">${masthead}${image('moon-gate', 'ochre', 'scene-art gate')}${image('pine', 'ink', 'scene-art pine')}<div class="scene-text quote"><p class="eyebrow">余韵 / 留白不是空白</p><h1>于山水之间，<br>留一页余韵。</h1><p class="body-copy">让草木与建筑轻轻入画，<br>把故事的落点，留给人间。</p><span class="small-seal">纸上<br>山河</span></div>${colophon('题跋')}</main>`,
    compositionStyle +
      `.quote{left:120px;top:285px;width:1100px}.quote h1{font-size:100px;margin-top:30px}.quote .body-copy{margin-top:38px}.gate{width:970px;height:800px;right:-80px;bottom:110px;opacity:.56}.pine{width:700px;height:700px;right:-40px;top:210px;opacity:.55}.small-seal{display:inline-block;color:#873b2a;border:3px double #873b2a;padding:9px;font:24px/1.2 "Songti SC",serif;letter-spacing:.1em;margin-top:24px}`,
  )
}

mkdirSync(destination, { recursive: true })
for (const palette of Object.keys(palettes)) {
  mkdirSync(join(destination, palette), { recursive: true })
  for (const asset of assets)
    writeFileSync(join(destination, palette, `${asset.id}.svg`), svg(asset, palette))
}
const demoDirectory = join(destination, 'demo')
mkdirSync(demoDirectory, { recursive: true })
writeFileSync(join(demoDirectory, 'index.html'), gallery())
for (const id of ['cover', 'temple-study', 'palace-chapter', 'garden-quote'])
  writeFileSync(join(demoDirectory, `${id}.html`), composition(id))
writeFileSync(
  join(destination, 'catalog.json'),
  JSON.stringify(
    {
      version: 1,
      dimensions: { width: 1000, height: 800 },
      background: 'transparent',
      palettes,
      assets: assets.map(({ draw: _draw, ...asset }) => ({
        ...asset,
        files: Object.fromEntries(
          Object.keys(palettes).map((palette) => [palette, `${palette}/${asset.id}.svg`]),
        ),
      })),
    },
    null,
    2,
  ) + '\n',
)
console.log(
  `Generated ${assets.length} original illustrations × ${Object.keys(palettes).length} palettes and four composition demos: ${destination}`,
)
