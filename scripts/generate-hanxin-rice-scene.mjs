import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const destination = resolve(process.argv[2] ?? 'output/hanxin-rice-detail-study')
mkdirSync(destination, { recursive: true })
const ink = '#3b3931'
const path = (outline, fill, extra = '') => `<path d="${outline}" fill="${fill}" ${extra}/>`
const line = (outline, width = 2, color = ink, opacity = 1) =>
  `<path d="${outline}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`
const group = (name, content, extra = '') => `<g id="rice-${name}" ${extra}>${content}</g>`
const ellipse = (horizontal, vertical, width, height, fill, extra = '') =>
  `<ellipse cx="${horizontal}" cy="${vertical}" rx="${width}" ry="${height}" fill="${fill}" ${extra}/>`
const brush = (points, width, color, opacity = 1) => {
  const position = (progress) =>
    [0, 1].map(
      (axis) =>
        (1 - progress) ** 3 * points[0][axis] +
        3 * (1 - progress) ** 2 * progress * points[1][axis] +
        3 * (1 - progress) * progress ** 2 * points[2][axis] +
        progress ** 3 * points[3][axis],
    )
  const left = [],
    right = []
  for (let index = 0; index <= 30; index++) {
    const progress = index / 30
    const center = position(progress)
    const before = position(Math.max(0, progress - 0.001))
    const after = position(Math.min(1, progress + 0.001))
    const horizontal = after[0] - before[0],
      vertical = after[1] - before[1]
    const length = Math.hypot(horizontal, vertical) || 1
    const pressure =
      (width * (0.16 + Math.sin(progress * Math.PI) * 0.84) * (1 - progress * 0.75)) / 2
    const offset = [(-vertical / length) * pressure, (horizontal / length) * pressure]
    left.push(center.map((coordinate, axis) => +(coordinate + offset[axis]).toFixed(2)))
    right.unshift(center.map((coordinate, axis) => +(coordinate - offset[axis]).toFixed(2)))
  }
  return path(
    `M${[...left, ...right].map((point) => point.join(' ')).join('L')}Z`,
    color,
    `opacity="${opacity}"`,
  )
}

const definitions = `<defs>
<linearGradient id="rice-skin" x1="0" x2="1" y2=".5"><stop stop-color="#a98a6c"/><stop offset=".38" stop-color="#d9bc91"/><stop offset=".72" stop-color="#dec49c"/><stop offset="1" stop-color="#b29876"/></linearGradient>
<linearGradient id="rice-youth-skin" x1="1" x2="0" y2=".65"><stop stop-color="#b79671"/><stop offset=".5" stop-color="#e0c49b"/><stop offset="1" stop-color="#c4a27c"/></linearGradient>
<linearGradient id="rice-old-robe" x2=".9" y2="1"><stop stop-color="#89918a"/><stop offset=".5" stop-color="#697b76"/><stop offset="1" stop-color="#4f625e"/></linearGradient>
<linearGradient id="rice-youth-robe" x2=".8" y2="1"><stop stop-color="#b0a182"/><stop offset=".4" stop-color="#948973"/><stop offset="1" stop-color="#736f5d"/></linearGradient>
<linearGradient id="rice-trousers" x1=".2" y1="0" x2="1" y2="1"><stop stop-color="#b1aba0"/><stop offset=".5" stop-color="#96988b"/><stop offset="1" stop-color="#747e75"/></linearGradient>
<linearGradient id="rice-bowl-wash" x2=".2" y2="1"><stop stop-color="#aa825b"/><stop offset="1" stop-color="#664c36"/></linearGradient>
<linearGradient id="rice-distance" x2="0" y2="1"><stop stop-color="#738780" stop-opacity=".24"/><stop offset="1" stop-color="#738780" stop-opacity="0"/></linearGradient>
<filter id="rice-pigment" x="-4%" y="-4%" width="108%" height="108%"><feTurbulence type="fractalNoise" baseFrequency=".68" numOctaves="3" seed="19" result="grain"/><feColorMatrix in="grain" type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope=".16" intercept=".84"/><feFuncG type="linear" slope=".16" intercept=".84"/><feFuncB type="linear" slope=".16" intercept=".84"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id="rice-wash" x="-12%" y="-12%" width="124%" height="124%"><feGaussianBlur stdDeviation="2.4"/></filter>
<radialGradient id="rice-cheek"><stop stop-color="#a56c53" stop-opacity=".17"/><stop offset="1" stop-color="#a56c53" stop-opacity="0"/></radialGradient>
<radialGradient id="rice-landscape-fade"><stop offset=".38" stop-color="white"/><stop offset=".8" stop-color="white" stop-opacity=".68"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>
<mask id="rice-landscape-mask" maskUnits="userSpaceOnUse" x="0" y="300" width="1600" height="700"><ellipse cx="800" cy="650" rx="810" ry="340" fill="url(#rice-landscape-fade)"/></mask>
</defs>`

const landscape = group(
  'landscape',
  path(
    'M18 533Q91 488 154 454Q198 435 235 390Q262 373 294 422Q327 431 361 386Q405 339 431 368Q493 427 538 405Q612 362 651 402Q701 420 744 379Q802 334 835 380Q889 414 948 385Q1000 348 1045 376Q1115 427 1164 395Q1229 360 1294 408Q1390 444 1518 431L1550 663L4 655Z',
    'url(#rice-distance)',
  ) +
    path(
      'M33 613Q179 550 296 580Q384 604 486 567Q583 536 717 574Q803 600 919 561Q1024 519 1120 555Q1287 613 1532 563L1545 711L26 728Z',
      '#82918a',
      'opacity=".13" filter="url(#rice-wash)"',
    ) +
    line(
      'M173 463Q198 448 211 426L233 405M202 470L245 429L265 443M401 401L419 378L447 413M775 408L806 367L822 395',
      2,
      '#6e7f78',
      0.26,
    ) +
    line(
      'M25 680Q155 661 257 675M56 704Q161 695 232 706M1250 675Q1365 660 1503 675M1300 693L1458 693',
      1.5,
      '#74837c',
      0.3,
    ) +
    path(
      'M73 831Q249 763 406 774Q523 746 664 796Q784 834 941 796Q1080 751 1221 795Q1371 833 1512 814L1515 941Q1341 925 1161 943Q826 911 605 945Q315 914 59 931Z',
      '#a18e6c',
      'opacity=".17" filter="url(#rice-wash)"',
    ),
)

const stone = group(
  'river-stone',
  path(
    'M296 739Q316 699 362 690L473 702Q514 716 523 755L500 785L313 790Z',
    '#7c8073',
    'opacity=".62" filter="url(#rice-pigment)"',
  ) +
    path('M303 744L360 704L434 716L468 747L404 763L320 761Z', '#b2ac95', 'opacity=".6"') +
    line('M315 755L364 734L393 741M419 721L453 743L492 752M334 777L388 766', 1.5, '#575e51', 0.55),
)

const oldLegs = group(
  'old-woman-legs',
  path(
    'M422 678Q462 662 488 695L497 761Q488 807 482 835L444 839Q442 794 435 774L404 725Z',
    'url(#rice-trousers)',
  ) +
    path(
      'M486 674Q530 661 558 696Q574 724 575 767L592 833L554 847Q535 803 527 769Q502 751 478 727Z',
      'url(#rice-trousers)',
    ) +
    line(
      'M442 722Q467 738 468 767L459 813M484 733L476 769M541 718Q547 746 549 768L574 822',
      2.3,
      '#535e55',
      0.65,
    ) +
    path('M439 821L484 818L489 848L448 853Z', '#c2bca6') +
    path('M549 829L590 817L601 843L559 858Z', '#c2bca6') +
    group(
      'old-left-shoe',
      path(
        'M446 842Q468 830 485 843L500 856Q517 862 514 873Q484 888 428 878Q416 872 425 860Z',
        '#454d43',
      ) + line('M430 872Q470 882 508 870M450 845L449 862', 1.5, '#b2ac8d', 0.7),
    ) +
    group(
      'old-right-shoe',
      path('M559 845Q580 831 600 841L619 856Q649 859 649 873Q619 885 566 879L549 868Z', '#465044') +
        line('M558 871Q610 883 641 871M571 845L574 863', 1.5, '#b2ac8d', 0.7),
    ),
)

const oldRobe = group(
  'old-woman-body',
  path(
    'M384 427Q356 440 348 487L337 579Q323 628 341 678Q373 721 420 738L503 748Q545 734 550 706Q515 664 504 620L482 540L459 448L424 419Z',
    'url(#rice-old-robe)',
    'filter="url(#rice-pigment)"',
  ) +
    path(
      'M361 480Q355 545 371 589Q375 617 357 646Q385 686 436 696L473 717L394 720Q351 702 335 659Q328 616 339 567Z',
      '#405950',
      'opacity=".45"',
    ) +
    path(
      'M442 470Q452 526 472 560Q480 619 508 664Q479 645 454 590L437 523Z',
      '#b0b29a',
      'opacity=".25"',
    ) +
    path('M387 430L405 422L432 457L456 434L466 449L417 504L397 481Z', '#c0b9a0') +
    path('M393 443L404 435L435 475L428 487Z', '#455e55') +
    path('M453 450L462 455L418 511L409 496Z', '#435e55') +
    line(
      'M388 435Q384 466 398 491M426 500Q414 548 429 595L453 639M390 509Q379 545 389 576M373 610Q369 643 405 669M428 629Q447 665 493 690M399 691Q459 724 517 722M348 662Q375 695 416 704',
      2.7,
      '#344d44',
      0.8,
    ) +
    line(
      'M391 515Q385 546 399 575M434 555L443 587M440 644Q469 681 497 686M370 638Q382 663 402 671M414 703Q461 730 503 731',
      1.4,
      '#d2cab0',
      0.6,
    ) +
    brush(
      [
        [403, 501],
        [386, 550],
        [418, 604],
        [433, 631],
      ],
      12,
      '#304d43',
      0.3,
    ) +
    brush(
      [
        [354, 614],
        [347, 652],
        [389, 681],
        [424, 692],
      ],
      14,
      '#304d43',
      0.28,
    ) +
    brush(
      [
        [422, 647],
        [449, 696],
        [492, 711],
        [524, 712],
      ],
      11,
      '#344d43',
      0.4,
    ) +
    brush(
      [
        [439, 511],
        [445, 547],
        [454, 574],
        [466, 596],
      ],
      9,
      '#bfc1a5',
      0.26,
    ) +
    line('M438 630L446 643L444 652M473 700L481 703L479 708M468 699L476 702', 0.85, '#c7bfa4', 0.6),
)

const oldBackArm = group(
  'old-woman-left-arm',
  path(
    'M365 461Q346 476 341 505L330 559Q330 592 354 625L379 649L401 626L374 587Q369 557 387 517Q396 491 383 468Z',
    'url(#rice-old-robe)',
  ) +
    line(
      'M351 498Q345 539 346 560Q351 591 375 617M375 533L360 566L373 590M348 579L367 611',
      2.4,
      '#344e45',
      0.8,
    ) +
    path('M376 628L393 616L410 638L393 652Z', '#c5bca1') +
    group(
      'old-left-hand',
      path(
        'M392 641Q406 634 411 645L424 657Q434 669 429 679Q426 682 421 677L409 665L414 682Q417 690 411 692L403 680L394 674L390 657Z',
        'url(#rice-skin)',
      ) +
        line(
          'M403 651L416 665M399 657L408 671M398 666L405 679M418 667L424 675',
          1.3,
          '#705b45',
          0.8,
        ),
    ),
)

const youthLegs = group(
  'youth-legs',
  group(
    'youth-far-leg',
    path(
      'M1098 652Q1135 660 1147 705L1168 793Q1170 814 1190 820L1301 831L1305 865Q1234 878 1178 865Q1132 862 1125 832L1083 715Z',
      'url(#rice-trousers)',
    ) +
      path(
        'M1132 718L1154 806Q1157 835 1192 841L1300 847L1303 864Q1221 873 1179 862Q1134 857 1130 826Z',
        '#66786e',
        'opacity=".38"',
      ) +
      line(
        'M1111 699Q1124 739 1132 780M1144 802Q1146 843 1183 849L1267 854M1174 831L1198 839M1271 836L1294 839',
        2.4,
        '#58665f',
        0.75,
      ),
  ) +
    group(
      'youth-far-foot',
      path('M1292 832L1310 826L1323 853L1302 865Z', '#c8c2ab') +
        path(
          'M1307 834Q1310 816 1326 810Q1340 811 1340 831L1335 859Q1330 873 1314 874L1306 864Z',
          '#3c463d',
        ) +
        line('M1315 865L1326 858L1332 824M1317 840L1335 840', 1.8, '#a6a58e', 0.7),
    ) +
    group(
      'youth-near-leg',
      path(
        'M1020 641Q1058 632 1097 668Q1123 698 1087 723L997 756Q966 777 946 822L904 814Q920 758 950 721L1011 684Z',
        'url(#rice-trousers)',
      ) +
        path(
          'M1036 666Q1075 663 1087 687Q1064 719 998 735L962 778L946 787L969 731Z',
          '#bdbaa7',
          'opacity=".4"',
        ) +
        line(
          'M1026 682Q1054 675 1079 688M1084 713Q1041 724 997 744L960 792M949 753L940 779M924 796L952 804',
          2.5,
          '#58665f',
          0.8,
        ),
    ) +
    group(
      'youth-near-foot',
      path('M907 806L950 817L937 846L894 835Z', '#c9c1a8') +
        path(
          'M901 829Q920 825 941 839L943 865Q919 880 885 880L848 874Q836 866 848 857L879 847Z',
          '#3b473c',
        ) +
        line('M850 867Q897 879 933 862M908 836L900 855', 1.7, '#aaa78c', 0.75),
    ),
)

const youthBody = group(
  'youth-body',
  path(
    'M1022 392Q1062 388 1098 419Q1122 451 1120 502L1148 610Q1142 657 1103 688Q1044 705 993 673L1003 607Q991 556 986 508L994 442Z',
    'url(#rice-youth-robe)',
    'filter="url(#rice-pigment)"',
  ) +
    path(
      'M1080 442Q1100 489 1090 527Q1092 571 1111 605L1101 653L1130 635L1147 608L1120 497L1101 445Z',
      '#554f40',
      'opacity=".3"',
    ) +
    path('M1007 408L1021 393L1055 431L1072 412L1085 427L1034 488L1008 450Z', '#d2c9ae') +
    path('M1016 414L1022 404L1059 449L1050 462Z', '#676e5e') +
    path('M1075 429L1082 434L1036 490L1027 478Z', '#696857') +
    path('M998 601Q1060 619 1138 598L1143 619Q1086 645 998 628Z', '#625744') +
    path('M1088 618L1104 620L1108 673L1092 687Z', '#756851') +
    line(
      'M1039 483Q1026 518 1038 569L1029 602M1076 487Q1073 539 1093 579M1008 546L1019 584M1040 642L1028 675M1062 647L1069 682M1116 636L1099 675',
      2.6,
      '#5a5847',
      0.8,
    ) +
    line('M1046 497Q1037 532 1051 564M1053 648L1049 681M1109 646L1089 680', 1.5, '#d2c6a8', 0.7) +
    brush(
      [
        [1037, 488],
        [1013, 536],
        [1035, 567],
        [1030, 599],
      ],
      10,
      '#53523f',
      0.32,
    ) +
    brush(
      [
        [1081, 489],
        [1075, 526],
        [1091, 561],
        [1100, 591],
      ],
      13,
      '#53523f',
      0.3,
    ) +
    brush(
      [
        [1109, 648],
        [1100, 665],
        [1090, 680],
        [1080, 685],
      ],
      9,
      '#53523f',
      0.34,
    ) +
    line('M1070 604L1082 607L1080 619M1029 627L1038 631M1107 620L1115 618', 1.1, '#a29474', 0.8),
)

const youthFarArm = group(
  'youth-right-arm',
  path(
    'M1090 426Q1119 436 1125 467Q1128 502 1093 540Q1064 562 1026 578L899 593L890 562L998 542L1048 507L1065 464Z',
    'url(#rice-youth-robe)',
  ) +
    path(
      'M1103 477Q1103 510 1072 533L1021 565L908 583L902 590L1029 579L1092 543Q1121 516 1121 480Z',
      '#655e4b',
      'opacity=".46"',
    ) +
    line(
      'M1091 450Q1105 480 1079 516M1089 531L1036 554M1056 529L1019 553L955 566M956 579L920 584',
      2.5,
      '#625b47',
      0.85,
    ) +
    path('M894 559L909 588L892 596L878 563Z', '#d3c5a2'),
)

const oldFace = group(
  'old-woman-head',
  path('M402 390L400 429L426 449L449 432L444 397Z', 'url(#rice-skin)') +
    path('M410 405L439 398L439 426L429 435Z', '#8c7358', 'opacity=".33"') +
    path(
      'M389 309Q405 287 435 291Q460 293 471 315L474 337Q478 351 476 368L477 382Q472 404 450 416Q429 421 409 404L392 381L383 348Z',
      'url(#rice-skin)',
    ) +
    ellipse(448, 369, 25, 24, 'url(#rice-cheek)') +
    path(
      'M392 319Q395 350 401 370Q408 391 427 402L443 413Q420 413 406 401L391 380L383 347Z',
      '#917b62',
      'opacity=".25"',
    ) +
    path(
      'M385 322Q379 294 393 278Q406 263 427 268Q462 269 472 296L472 321Q459 305 441 303Q416 297 401 316L397 342L388 346Z',
      '#70776c',
    ) +
    path('M391 290Q366 279 375 257Q384 238 405 245Q423 251 420 268L408 279Z', '#7b8074') +
    line(
      'M382 258Q393 250 407 257M380 267Q390 260 405 266M395 278Q420 270 440 280Q461 289 466 310M392 294Q405 276 433 287M399 303Q423 288 450 301M387 309L391 333',
      2.3,
      '#b4b39b',
      0.8,
    ) +
    line('M398 304Q413 289 433 293M403 299Q426 283 450 296', 1.3, '#3d4940', 0.8) +
    path('M386 343Q374 334 375 351Q375 369 391 370L394 356Z', '#bd9e79') +
    line('M384 347Q379 344 380 356L387 362M385 353L387 358', 1.4, '#725e48', 0.8) +
    group(
      'old-woman-eyes',
      path('M407 339Q420 332 434 337L432 339Q420 336 408 341Z', '#555442') +
        path('M445 337Q456 333 465 338L466 340Q455 337 446 339Z', '#555442') +
        path('M410 351Q420 343 431 349Q424 357 411 354Z', '#d8c8a5') +
        path('M448 350Q456 344 464 350L460 353L450 353Z', '#d8c8a5') +
        ellipse(424, 350, 3.2, 3.5, '#373d34') +
        ellipse(458, 349, 2.6, 3.1, '#373d34') +
        line('M410 351Q421 343 431 349M448 350Q456 344 464 350', 1.9, '#424536') +
        line(
          'M410 356Q421 361 430 355M449 356Q456 359 463 355M403 348L400 351M405 355L401 359',
          1.1,
          '#7b6b51',
          0.8,
        ),
    ) +
    path(
      'M445 342Q444 352 448 359L455 369L451 373L445 370Q448 365 441 358Z',
      '#9e7c59',
      'opacity=".24"',
    ) +
    line(
      'M445 343Q444 354 447 360L453 369Q451 373 447 373M441 370Q439 372 442 374M454 374L458 373',
      1.2,
      '#7b624b',
      0.85,
    ) +
    path('M438 387Q450 382 461 386Q451 390 439 389Z', '#815d4c', 'opacity=".75"') +
    line(
      'M441 392Q451 395 459 391M447 401Q453 403 458 400M432 369Q426 379 431 388M465 372Q469 382 464 391M412 324Q429 318 441 325M414 329Q428 323 437 328M407 373L416 383M402 381L411 389',
      1.1,
      '#8b7659',
      0.75,
    ) +
    line('M392 375Q402 400 424 410M461 406L448 416', 1.6, '#6d614c', 0.65) +
    brush(
      [
        [408, 366],
        [405, 377],
        [410, 389],
        [419, 394],
      ],
      7,
      '#8b6e51',
      0.16,
    ) +
    brush(
      [
        [461, 343],
        [465, 352],
        [467, 360],
        [464, 367],
      ],
      6,
      '#a47c58',
      0.2,
    ) +
    line(
      'M410 345L414 343M416 342L419 341M445 346L449 344M398 368L402 373M420 379L423 384M461 393L458 397M418 415L421 421M434 420L432 426',
      0.75,
      '#8c7455',
      0.65,
    ),
)

const youthFace = group(
  'youth-head',
  path('M1015 361L1009 398L1046 428L1073 414L1060 362Z', 'url(#rice-youth-skin)') +
    path('M1018 367L1044 385L1059 370L1053 402L1041 411L1016 394Z', '#947856', 'opacity=".3"') +
    path(
      'M994 272Q1013 250 1042 255Q1070 259 1080 286L1082 323Q1086 350 1066 372L1044 390Q1028 394 1007 377L990 362Q981 351 983 338L985 309Z',
      'url(#rice-youth-skin)',
    ) +
    path(
      'M1060 272Q1079 286 1078 321Q1085 350 1065 370L1044 389L1038 378Q1057 361 1062 340Z',
      '#9a7c59',
      'opacity=".24"',
    ) +
    ellipse(1006, 347, 25, 22, 'url(#rice-cheek)') +
    path(
      'M986 303Q977 275 994 255Q1003 242 1024 242Q1058 242 1074 263Q1090 278 1084 314L1074 331L1066 302Q1043 286 1022 275Q1004 282 996 303Z',
      '#3e4940',
    ) +
    path('M1017 247Q1005 231 1015 214Q1027 203 1041 216Q1056 224 1048 241L1034 248Z', '#3e4940') +
    path('M1009 245L1048 239L1051 247L1010 254Z', '#736145') +
    line(
      'M1017 225Q1025 214 1035 220M1020 231Q1033 220 1041 229M994 278Q1005 259 1024 256Q1055 257 1072 281M994 287Q1008 270 1023 267M1028 261Q1050 268 1062 281M1036 270L1068 293',
      2.3,
      '#969d85',
      0.62,
    ) +
    line('M991 295L982 318M1079 300L1084 326M1075 311L1078 339', 1.5, '#354138', 0.8) +
    path('M1074 320Q1087 313 1088 326Q1087 344 1073 347L1069 337Z', '#c3a17a') +
    line('M1080 325Q1086 321 1083 333L1076 339', 1.3, '#7c624a', 0.9) +
    group(
      'youth-eyes',
      path('M989 308Q1001 302 1017 306L1016 308Q1001 305 990 310Z', '#474a3b') +
        path('M1030 307Q1042 302 1054 308L1052 310Q1041 306 1031 309Z', '#474a3b') +
        path('M989 320Q1002 314 1015 319Q1006 324 990 323Z', '#e3d6b5') +
        path('M1032 320Q1043 315 1053 320Q1044 324 1033 323Z', '#e3d6b5') +
        ellipse(999, 319.5, 2.8, 2.8, '#333b31') +
        ellipse(1039, 319.5, 2.3, 2.7, '#333b31') +
        line('M989 320Q1002 314 1015 319M1032 320Q1043 315 1053 320', 1.7, '#3f4536') +
        line('M991 325Q1002 328 1012 324M1034 325L1048 325', 0.9, '#8c7758', 0.7),
    ) +
    path(
      'M1021 313Q1017 326 1019 333L1011 339L1015 344L1024 343L1027 339Q1021 333 1024 319Z',
      '#a17e56',
      'opacity=".22"',
    ) +
    line(
      'M1021 314Q1018 325 1019 332M1015 336Q1008 340 1015 343L1022 342M1026 339L1027 342',
      1.15,
      '#8c6c4b',
      0.85,
    ) +
    path('M999 357Q1013 351 1025 357L1015 360L1004 360Z', '#8d6450', 'opacity=".74"') +
    line(
      'M1002 358Q1014 361 1024 357M1009 365Q1016 367 1022 364M1027 376Q1035 381 1043 376',
      1.3,
      '#85694e',
      0.85,
    ) +
    line('M988 352Q992 363 1006 373M1059 355Q1055 370 1046 379', 1.25, '#8a7457', 0.75) +
    brush(
      [
        [1049, 330],
        [1057, 341],
        [1054, 354],
        [1046, 361],
      ],
      9,
      '#a37b57',
      0.16,
    ) +
    brush(
      [
        [994, 335],
        [990, 343],
        [993, 350],
        [1000, 354],
      ],
      8,
      '#b1875e',
      0.13,
    ) +
    line(
      'M1009 349L1011 352M1008 368L1014 369M1069 349L1066 354M1064 292L1068 301',
      0.7,
      '#8f7452',
      0.5,
    ),
)

const oldFrontArm = group(
  'old-woman-right-arm',
  path(
    'M446 451Q472 442 489 467Q513 502 546 523L610 542L683 539L695 570L610 584Q555 580 512 558Q467 535 448 508Q437 487 446 451Z',
    'url(#rice-old-robe)',
  ) +
    path(
      'M472 478Q501 522 547 543L613 563L684 555L690 571L609 583Q556 576 510 556Q471 536 455 508Z',
      '#425d51',
      'opacity=".4"',
    ) +
    line(
      'M461 466Q476 501 505 519M481 500Q509 537 553 552L606 568M518 545L547 559M613 548L665 548M625 575L673 565',
      2.5,
      '#334f43',
      0.8,
    ) +
    line('M484 492Q507 524 549 540L606 556M626 552L665 549', 1.5, '#c2c0a3', 0.65) +
    path('M679 537L693 535L705 568L691 575Z', '#d0c4a3') +
    group(
      'old-right-hand',
      path(
        'M695 541Q708 536 721 536L749 540Q756 542 753 547L730 547L752 553Q762 556 759 561L734 556L750 565Q757 569 752 573L728 562Q714 562 703 568L700 562Z',
        'url(#rice-skin)',
      ) +
        line(
          'M708 545L724 543L742 546M712 551L730 550L750 556M714 558L731 555M704 545Q701 551 706 559M721 539L730 540',
          1.2,
          '#795f45',
          0.9,
        ),
    ),
)

const bowl = group(
  'shared-bowl',
  ellipse(799, 598, 61, 10, '#807456', 'opacity=".15"') +
    path('M727 541Q750 588 791 596Q839 596 866 541Z', 'url(#rice-bowl-wash)') +
    path(
      'M742 548Q761 578 793 581Q824 581 850 550L844 569Q817 591 794 590Q762 587 742 561Z',
      '#c29a6b',
      'opacity=".45"',
    ) +
    ellipse(796, 541, 70, 19, '#6b5037') +
    ellipse(796, 538, 64, 15, '#d5bd8c') +
    ellipse(796, 535, 53, 12, '#e9d7ac') +
    line('M740 544Q792 560 851 544M773 592Q793 600 815 592', 2, '#4f4431', 0.9) +
    [
      'M756 535L763 532',
      'M769 540L778 536',
      'M783 530L791 534',
      'M801 540L808 536',
      'M817 531L825 534',
      'M830 540L837 537',
      'M791 542L797 539',
    ]
      .map((outline) => line(outline, 2.1, '#b6a17b', 0.8))
      .join(''),
)

const youthHands = group(
  'youth-hands',
  group(
    'youth-right-hand',
    path(
        'M885 565Q876 559 868 563L857 571Q841 585 820 590L797 593Q789 593 789 597Q790 601 798 600L820 598L802 603Q795 604 797 608Q799 610 806 608L830 603Q846 602 860 592Q879 591 895 581Z',
      'url(#rice-youth-skin)',
    ) +
      path(
        'M884 580Q869 585 858 585L831 596L808 599L831 601L860 591L874 586Z',
        '#9d7a53',
        'opacity=".24"',
      ) +
      line(
        'M875 569Q870 566 864 570L855 578M878 576Q863 582 850 589L821 595L800 596M880 581L865 587L833 599L807 605M863 576L859 580',
        1.05,
        '#7c6045',
        0.8,
      ),
  ) +
    group(
      'youth-left-arm',
      path(
        'M1010 433Q987 427 968 455L940 493Q914 513 867 524L850 550L866 569Q921 559 963 535Q991 520 1009 490L1029 455Z',
        'url(#rice-youth-robe)',
      ) +
        path(
          'M1002 445Q985 479 960 510Q919 542 861 554L867 568Q923 556 962 535Q993 517 1010 488L1027 457Z',
          '#695f4c',
          'opacity=".3"',
        ) +
        line(
          'M994 451Q979 479 955 503M1002 470Q979 510 946 525L890 545M962 516L940 533M907 532L877 539',
          2.5,
          '#625a47',
          0.8,
        ) +
        line('M980 475Q959 508 926 522M915 531L886 540', 1.5, '#ded0ae', 0.65) +
        path('M866 520L882 531L863 569L847 558Z', '#cec1a0') +
        group(
          'youth-left-hand',
          path(
            'M858 535Q847 528 836 530L823 532Q819 533 820 537L835 536Q840 538 839 542L827 546L819 548Q815 550 818 553L834 549L822 554Q818 556 821 559L836 554Q848 553 854 546Z',
            'url(#rice-youth-skin)',
          ) +
            line(
              'M848 536Q841 532 833 534M846 542L835 545L823 550M845 547L833 551M826 554L823 556',
              1,
              '#7a5e43',
              0.85,
            ),
        ),
    ),
)

const basket = group(
  'washing-basket',
  ellipse(234, 825, 64, 12, '#6f654d', 'opacity=".12"') +
    path('M174 748L292 748L280 815Q235 835 186 814Z', '#927b55') +
    path('M184 752L282 752L272 809Q239 822 196 811Z', '#b0986b') +
    Array.from({ length: 9 }, (_, index) => {
      const horizontal = 187 + index * 11
      return line(
        `M${horizontal} 752L${horizontal + (235 - horizontal) * 0.17} 814`,
        1.5,
        '#655b40',
        0.55,
      )
    }).join('') +
    [762, 773, 784, 795, 806]
      .map((vertical) =>
        line(
          `M${176 + (vertical - 748) * 0.2} ${vertical}Q234 ${vertical + 14} ${292 - (vertical - 748) * 0.2} ${vertical}`,
          1.1,
          '#6d5d40',
          0.65,
        ),
      )
      .join('') +
    path('M181 748Q179 725 203 722L233 730L248 716L279 737L284 750Z', '#c8c1a8') +
    path('M203 724L223 758L240 748L252 722L232 731Z', '#9caa9b', 'opacity=".8"') +
    line('M194 733Q213 737 224 752M249 727L258 740L273 745M241 735L235 750', 1.4, '#6d7d6d', 0.65) +
    line('M174 748Q231 770 292 748M175 752Q231 775 291 752', 3, '#6e5d40', 0.85),
)

const foreground = group(
  'foreground',
  line(
    'M192 891Q278 872 347 882M271 905L366 906M604 907Q698 891 768 904M1138 916Q1279 890 1395 904',
    2.3,
    '#776e53',
    0.42,
  ) +
    path(
      'M208 856Q176 835 165 809Q184 828 209 833Q198 811 200 793Q216 819 220 851Z',
      '#5d7160',
      'opacity=".55"',
    ) +
    line(
      'M213 866Q215 831 235 818M1366 892Q1371 861 1388 845M1371 873L1354 859M1380 861L1395 857',
      1.8,
      '#64715b',
      0.7,
    ) +
    ellipse(719, 893, 10, 4, '#7b816c', 'opacity=".45"') +
    ellipse(736, 899, 6, 3, '#7b816c', 'opacity=".45"'),
)

const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-labelledby="rice-title rice-desc"><title id="rice-title">漂母饭信 · 人物结构重画</title><desc id="rice-desc">原创历史人物意象。老妪坐于低石，青年单膝着地，双手接碗。服饰、容貌与山川为艺术设计，不是肖像或历史场景复原。</desc>${definitions}<g mask="url(#rice-landscape-mask)">${landscape}</g>${stone}${basket}${oldLegs}${youthLegs}${oldRobe}${oldBackArm}${youthFarArm}${youthBody}${oldFace}${youthFace}${oldFrontArm}${bowl}${youthHands}${foreground}</svg>`
writeFileSync(join(destination, 'rice-offering.svg'), artwork)
const scene = `<style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden}body{background:#dfc69c;color:#423b30;font-family:"Songti SC","STSong",serif}*{box-sizing:border-box}.chapter{position:absolute;left:104px;top:69px;font-size:21px;letter-spacing:6px;color:#796b50}h1{position:absolute;left:100px;top:112px;font-size:68px;font-weight:500;margin:0;letter-spacing:3px}.subtitle{position:absolute;left:104px;top:205px;color:#847155;font-size:24px;letter-spacing:2px}.art{position:absolute;left:38px;top:175px;width:1370px;height:856px}.art svg{width:100%;height:100%}.aside{position:absolute;left:1444px;top:330px;width:330px;padding-left:42px;border-left:1px solid #9d896146}.aside .small{font-size:21px;letter-spacing:3px;color:#8e7a59}.aside h2{font-size:42px;font-weight:400;color:#824635;letter-spacing:5px;margin:18px 0 25px}.aside p{font-size:27px;line-height:1.95;margin:0 0 28px}.aside .note{font-size:20px;line-height:1.8;color:#847457;border-top:1px solid #9d896146;padding-top:24px}.footer{position:absolute;left:104px;bottom:48px;font-size:18px;color:#8d7a59}.number{position:absolute;right:120px;bottom:48px;letter-spacing:3px;font-size:21px;color:#8d7a59}</style><div class="chapter">贰 ／ 贫困中的少年</div><h1>尚未得到机会的青年</h1><div class="subtitle">一饭之助，留在了史书之中。</div><div class="art">${artwork}</div><div class="aside"><div class="small">史书中的早年身影</div><h2>漂母饭信</h2><p>早年贫困，<br>曾受漂母饭食，<br>也曾忍受胯下之辱。</p><div class="note">据《史记》相关记载概括。<br>人物容貌与服饰为原创意象。</div></div><div class="footer">人物、衣饰与山水为原创意象，不作为真实肖像或场景复原。</div><div class="number">02 ／ 07</div>`
writeFileSync(
  join(destination, 'scene-02.html'),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"><title>漂母饭信 · 结构重画</title>${scene}</html>`,
)
writeFileSync(join(destination, 'scene-fragment.html'), scene)
writeFileSync(
  join(destination, 'artwork-manifest.json'),
  JSON.stringify(
    {
      id: 'hanxin-rice-detail-study',
      width: 1600,
      height: 1000,
      transparent: true,
      source: 'original editable SVG',
      sceneWidth: 1920,
      sceneHeight: 1080,
      groups: [
        'old-woman-head',
        'old-woman-body',
        'old-woman-legs',
        'old-woman-left-arm',
        'old-woman-right-arm',
        'youth-head',
        'youth-body',
        'youth-legs',
        'youth-right-arm',
        'youth-left-arm',
        'youth-hands',
        'shared-bowl',
      ],
      note: '原创历史人物意象；服饰和容貌不是历史复原。',
    },
    null,
    2,
  ),
)
console.log(destination)
