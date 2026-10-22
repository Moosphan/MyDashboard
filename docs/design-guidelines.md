# MyDashboard 设计规范入口

当前权威：**[设计规范 2.0 · HeroUI edition](design-system/spec-v2.md)**（2026-10-22）。后续设计和开发必须遵守，生产 UI 按阶段迁移。采用 HeroUI 3.2.6 公开组件、当前主题和既有紧凑桌面布局；自带图标优先，缺项补已确认的 Heroicons。不确定业务与布局先确认，详见 [交互审核](design-system/interaction-audit-v2.md)。

入口：[设计系统](design-system/README.md)、[页面交付规格](design-system/page-specs-v2.md)、[真实 React 设计稿](design-system/v2/README.md)。旧自建规范 [Quiet Workspace v3.2.0](design-system/legacy-v3.md) 与以下 v1 内容仅供历史溯源。

- [当前设计与组件规则](design-system/spec-v2.md)
- [当前交互设计稿](design-system/v2/README.md)
- [统一变更、迁移与例外管理](design-system/migration.md)

运行 `pnpm design:check` 与 `pnpm design:build` 检查当前设计资产，`pnpm design:preview` 打开新版工作台。历史生成器仅通过 `design:legacy:*` 使用。

以下为历史 v1 内容，仅供溯源；其中颜色、圆角、排版与交互描述不再具有规范效力。现有应用尚未完成 v3 全局迁移。

---

# DorckDashboard Design System Specification · v1 历史存档

## 1. Brand Identity

DorckDashboard is a personal, local-first productivity workspace for macOS. The design language, **"Vibrant Workspace,"** combines the professional utility of macOS with a modern, energetic visual flair.

- **Design Philosophy**: Minimalist structure, intentional whitespace, and high-contrast vibrant accents.
- **Core Value**: Efficiency through clarity and a professional "Mac Utility" aesthetic.

---

## 2. Color Palette

The color system uses a sophisticated neutral base with high-energy primary and accent colors to guide attention and define hierarchy.

### 2.1 Brand Colors

- **Primary (Vibrant Purple)**: `#8B5CF6`
  - Used for primary actions, active navigation states, and brand-identifying elements.
- **Accent (Amber)**: `#FFC402`
  - Used for high-priority alerts, progress indicators, and important status tags.
- **Secondary (Soft Lavender)**: `rgba(139, 92, 246, 0.1)`
  - Used for backgrounds of secondary buttons and subtle highlights.

### 2.2 Surface & Neutral Colors

- **Surface (Base)**: `#F9F9FF`
- **Surface Container (Low)**: `#F0F3FF`
- **Surface Container (High)**: `#FFFFFF`
- **Outline/Border**: `rgba(0, 0, 0, 0.08)`
- **Text (Primary)**: `#1A1A1E`
- **Text (Secondary/Muted)**: `#6B7280`

---

## 3. Typography

The system uses **Plus Jakarta Sans** for its modern, geometric feel and excellent readability at various scales.

| Role            | Font Weight    | Size | Letter Spacing |
| :-------------- | :------------- | :--- | :------------- |
| **Headline XL** | Bold (700)     | 32px | -0.02em        |
| **Headline LG** | Semibold (600) | 24px | -0.01em        |
| **Headline MD** | Semibold (600) | 20px | -0.01em        |
| **Body LG**     | Regular (400)  | 16px | 0              |
| **Body MD**     | Regular (400)  | 14px | 0              |
| **Label MD**    | Medium (500)   | 12px | 0.05em         |

---

## 4. Layout & Geometry

- **Corner Radius**: `8px` (Round Eight)
  - Applied to all buttons, cards, modals, and input fields for a friendly yet structured look.
- **Spacing Scale**: Base-4 system (4px, 8px, 12px, 16px, 24px, 32px, 48px).
- **Grid Strategy**:
  - **Sidebar**: Fixed width (240px or 280px).
  - **Content Area**: Flexible grid with generous padding (min 24px).
  - **Bento Grid**: Used for dashboard widgets to create a cohesive information density.

---

## 5. Component Patterns

### 5.1 Buttons

- **Primary**: Solid `#8B5CF6`, White text, 8px radius. High-intensity shadow on hover.
- **Secondary**: Lavender background `rgba(139, 92, 246, 0.1)`, Purple text `#8B5CF6`.
- **Outline**: 1px border `rgba(0, 0, 0, 0.08)`, Primary text.
- **Ghost**: No background/border, Primary text.

### 5.2 Inputs & Selectors

- **Text Fields**: Soft grey background, 8px radius, focus state with 2px purple ring.
- **Select Dropdowns**: Chevron-right icon, clean list overlays with hover states.
- **Color Pickers**: Circular swatches with a hex input field for customization.

### 5.3 Feedback & Indicators

- **Priority Tags**:
  - `High`: Amber background `#FFC402`, dark text.
  - `Medium`: Soft blue/lavender.
  - `Low`: Light grey.
- **Progress Bars**: 6px height, rounded ends, primary purple fill.
- **Status Badges**: Rounded pills with semantic colors (In Progress, Draft, Review).

---

## 6. Iconography

### 6.1 Icon Library

All icons in the project **must** use **Google Material Symbols Outlined** (Material Icons v3).

- **CDN Source**: Google Fonts
  ```html
  <link
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
    rel="stylesheet"
  />
  ```
- **Usage**: `<span class="material-symbols-outlined">icon_name</span>`
- **Search**: [fonts.google.com/icons](https://fonts.google.com/icons) — style filter: Outlined

### 6.2 Default Font Variation Settings

```css
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,
    'wght' 400,
    'GRAD' 0,
    'opsz' 24;
}
```

- **FILL 0** (default): Outlined / line style
- **FILL 1** (`.fill` class): Filled / solid style — used for active/selected states

### 6.3 Size Specification

| Context                     | Size | CSS Class     |
| --------------------------- | ---- | ------------- |
| Sidebar navigation          | 20px | `text-[20px]` |
| Top-level actions / buttons | 24px | (default)     |
| Inline with text            | 18px | `text-[18px]` |
| Small indicators / tags     | 14px | `text-[14px]` |
| Large hero / feature        | 32px | `text-[32px]` |

### 6.4 Rules

- **Consistency**: Icons should be paired with text labels in navigation to ensure accessibility.
- **No mixing**: Do not mix Material Symbols with other icon libraries (e.g., Font Awesome, Heroicons).
- **Stroke weight**: Controlled via `wght` axis (100–700), default 400.
- **Color**: Inherit from parent `color` / Tailwind `text-*` utilities. Do not set icon-specific colors unless for semantic indicators.

---

## 7. Interactive States

- **Hover**: 2% increase in brightness or subtle lift (y-axis -2px) with soft shadow.
- **Active/Pressed**: 95% scale transform for tactile feedback.
- **Transition**: All state changes should use a `200ms` ease-in-out transition.
