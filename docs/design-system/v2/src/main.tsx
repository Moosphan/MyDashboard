import { StrictMode, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Accordion,
  Alert,
  Avatar,
  Button,
  Card,
  Checkbox,
  Chip,
  Description,
  EmptyState,
  FieldError,
  Input,
  Kbd,
  Label,
  Link,
  ListBox,
  Modal,
  ProgressBar,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  Skeleton,
  Slider,
  Spinner,
  Switch,
  Tabs,
  TextArea,
  TextField,
  Tooltip,
} from '@heroui/react'
import layout from '../layout.json'
import appLogo from '../../../../assets/app-logo.svg'
import openaiLogo from '../../../../src/renderer/assets/logos/openai-light.svg'
import openaiDarkLogo from '../../../../src/renderer/assets/logos/openai-dark.svg'
import anthropicLogo from '../../../../src/renderer/assets/logos/anthropic.svg'
import googleLogo from '../../../../src/renderer/assets/logos/google.svg'
import { Icon } from './icons'
import { contrastRatio, primaryPair } from './primary-preview'
import './theme.css'
import 'virtual:project-theme.css'

for (const [name, value] of Object.entries(layout.layout)) {
  document.documentElement.style.setProperty(`--md-layout-${name}`, value)
}

const pages = [
  ['dashboard', 'Dashboard', 'space_dashboard'],
  ['writing', 'Writing', 'edit_note'],
  ['video', 'Video Studio', 'movie'],
  ['insights', 'Insights', 'insights'],
  ['ai-lab', 'AI Lab', 'science'],
  ['toolbox', 'Toolbox', 'construction'],
  ['settings', 'Settings', 'settings'],
  ['components', '组件规范', 'widgets'],
] as const
const states = [
  ['ready', '默认'],
  ['loading', '加载'],
  ['empty', '空状态'],
  ['error', '失败'],
  ['offline', '离线'],
]
const themes = [
  ['light', '浅色'],
  ['dark', '深色'],
  ['system', '跟随系统'],
]
const query = new URLSearchParams(location.search)

function BrandLogo({ src }: { src: string }) {
  if (src !== openaiLogo) return <img className="brand-logo" src={src} alt="" />
  return (
    <>
      <img className="brand-logo brand-logo-light" src={openaiLogo} alt="" />
      <img className="brand-logo brand-logo-dark" src={openaiDarkLogo} alt="" />
    </>
  )
}

function Choice({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string
  value: string
  options: string[][]
  onChange: (value: string) => void
  hideLabel?: boolean
}) {
  return (
    <Select
      aria-label={hideLabel ? label : undefined}
      value={value}
      onChange={(key) => onChange(String(key))}
    >
      {!hideLabel && <Label>{label}</Label>}
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox aria-label={`${label}选项`}>
          {options.map(([key, title]) => (
            <ListBox.Item key={key} id={key} textValue={title}>
              {title}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

function IconAction({
  children,
  ...props
}: React.ComponentProps<typeof Button> & { 'aria-label': string }) {
  return (
    <Tooltip>
      <Button {...props} isIconOnly>
        {children}
      </Button>
      <Tooltip.Content>{props['aria-label']}</Tooltip.Content>
    </Tooltip>
  )
}

function Notice({
  title,
  children,
  status = 'accent',
}: {
  title: string
  children: ReactNode
  status?: 'accent' | 'warning' | 'danger' | 'success'
}) {
  return (
    <Alert status={status}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{children}</Alert.Description>
      </Alert.Content>
    </Alert>
  )
}

function Meter({ title, value, detail }: { title: string; value: number; detail?: string }) {
  return (
    <div className="stack-small">
      <ProgressBar value={value} aria-label={title}>
        <div className="row-between">
          <Label>{title}</Label>
          <ProgressBar.Output />
        </div>
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </div>
  )
}

function Check({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return (
    <Checkbox defaultSelected={selected}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label>{children}</Label>
      </Checkbox.Content>
    </Checkbox>
  )
}

function Option({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Radio value={value}>
      <Radio.Content>
        <Radio.Control>
          <Radio.Indicator />
        </Radio.Control>
        <Label>{children}</Label>
      </Radio.Content>
    </Radio>
  )
}

function Range({
  label,
  min = -50,
  max = 100,
  initial = 0,
}: {
  label: string
  min?: number
  max?: number
  initial?: number
}) {
  return (
    <Slider defaultValue={initial} minValue={min} maxValue={max} aria-label={label}>
      <div className="row-between">
        <Label>{label}</Label>
        <Slider.Output />
      </div>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  )
}

function PageTitle({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <header className="page-title">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </div>
      <div className="action-row">{children}</div>
    </header>
  )
}

function ContentTabs({
  label,
  items,
  children,
}: {
  label: string
  items: string[][]
  children: ReactNode
}) {
  return (
    <Tabs defaultSelectedKey={items[0][0]}>
      <Tabs.ListContainer>
        <Tabs.List aria-label={label}>
          {items.map(([key, name]) => (
            <Tabs.Tab key={key} id={key}>
              {name}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      {items.map(([key]) => (
        <Tabs.Panel key={key} id={key}>
          {children}
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}

function PageState({ state, reset }: { state: string; reset: () => void }) {
  if (state === 'loading')
    return (
      <div className="stack-large" role="status" aria-label="正在加载页面">
        <div className="action-row">
          <Spinner size="sm" />
          <p className="text-sm text-muted">正在加载工作区…</p>
        </div>
        <div className="two-columns">
          {[1, 2].map((key) => (
            <Card key={key}>
              <Card.Content>
                <div className="stack-small">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>
      </div>
    )
  return (
    <Card>
      <Card.Content>
        <EmptyState>
          <Icon name={state === 'empty' ? 'inbox' : 'cloud_off'} />
          <h2 className="text-lg font-semibold">
            {state === 'empty' ? '这里还没有内容' : '暂时无法加载'}
          </h2>
          <p className="text-sm text-muted">
            {state === 'empty'
              ? '从一个新的想法、素材或订阅开始。'
              : '连接中断，已编辑的内容会保留。请检查连接后重试。'}
          </p>
          <Button onPress={reset}>{state === 'empty' ? '查看示例内容' : '重试'}</Button>
        </EmptyState>
      </Card.Content>
    </Card>
  )
}

type Detail = (title: string) => void
type Subscription = {
  name: string
  plan: string
  price: string
  logo?: string
  renewal?: string
}
const initialSubscriptions: Subscription[] = [
  {
    name: 'OpenAI',
    plan: 'ChatGPT Plus',
    price: '20.00',
    renewal: '11 月 01 日',
    logo: openaiLogo,
  },
  {
    name: 'Anthropic',
    plan: 'Claude Pro',
    price: '20.00',
    renewal: '11 月 01 日',
    logo: anthropicLogo,
  },
  {
    name: 'Google',
    plan: 'Google AI Pro',
    price: '19.99',
    renewal: '11 月 01 日',
    logo: googleLogo,
  },
]

function AILab({
  detail,
  subscriptions,
  openSubscription,
}: {
  detail: Detail
  subscriptions: Subscription[]
  openSubscription: () => void
}) {
  const [category, setCategory] = useState('all')
  const tools = [
    {
      name: 'ChatGPT',
      description: '对话、研究与日常灵感',
      provider: 'OpenAI',
      category: '对话',
      icon: 'chat',
    },
    {
      name: 'Claude',
      description: '写作与复杂问题推理',
      provider: 'Anthropic',
      category: '对话',
      icon: 'chat',
    },
    {
      name: 'Gemini',
      description: '多模态探索与长文阅读',
      provider: 'Google',
      category: '对话',
      icon: 'auto_awesome',
    },
    {
      name: 'Codex',
      description: '让想法成为可运行的代码',
      provider: 'OpenAI',
      category: '开发',
      icon: 'code',
    },
  ]
  return (
    <div className="stack-large">
      <div className="lab-top">
        <Card>
          <Card.Header>
            <div className="row-between">
              <div className="action-row">
                <Icon name="radar" />
                <Card.Title>Reset Radar</Card.Title>
              </div>
              <Chip size="sm" color="success" variant="soft">
                运行正常
              </Chip>
            </div>
            <Card.Description>重置窗口与账户状态</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="radar-visual">
              <div className="radar-orbit">
                <Icon name="radar" />
              </div>
              <div>
                <p className="text-xs text-muted">下一次预计重置</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  02<span className="text-base text-muted"> 小时 </span>34
                  <span className="text-base text-muted"> 分钟</span>
                </p>
                <p className="mt-2 text-xs text-muted">今日 17:30 · Asia/Shanghai</p>
              </div>
            </div>
            <div className="business-divider" />
            <div className="row-between text-sm">
              <span className="text-muted">高峰重置概率</span>
              <span>24% · 较低</span>
            </div>
          </Card.Content>
          <Card.Footer>
            <Button variant="secondary" size="sm" onPress={() => detail('重置历史')}>
              <Icon name="history" />
              查看历史
            </Button>
            <Button variant="ghost" size="sm" onPress={() => detail('账户状态')}>
              账户状态
              <Icon name="arrow_outward" />
            </Button>
          </Card.Footer>
        </Card>
        <Card>
          <Card.Header>
            <div className="row-between">
              <div className="action-row">
                <Icon name="data_usage" />
                <Card.Title>使用统计</Card.Title>
              </div>
              <Chip size="sm" variant="soft">
                Plus
              </Chip>
            </div>
            <Card.Description>示例账户 · 更新于 14:56</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="usage-layout">
              <div className="quota-grid">
                <Meter title="5 小时额度剩余" value={68} detail="17:30 重置" />
                <Meter title="每周额度剩余" value={42} detail="10 月 25 日重置" />
              </div>
              <figure
                className="usage-chart"
                aria-label="最近 7 日用量：32、48、40、72、56、88、65 万 token"
              >
                <div className="row-between text-xs">
                  <span className="text-muted">最近 7 日</span>
                  <span>65 万 token / 今日</span>
                </div>
                <div className="bar-chart">
                  {[32, 48, 40, 72, 56, 88, 65].map((amount, index) => (
                    <div key={index} className="chart-column">
                      <div className="usage-bar" style={{ height: `${amount}%` }} />
                      <span>{16 + index}</span>
                    </div>
                  ))}
                </div>
              </figure>
            </div>
            <div className="metrics-five">
              {[
                ['累计用量', '1,320 万'],
                ['今日用量', '65 万'],
                ['单日峰值', '88 万'],
                ['连续活跃', '5 天'],
                ['最长连续', '12 天'],
              ].map(([title, value]) => (
                <div key={title}>
                  <p className="text-xs text-muted">{title}</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
      </div>
      <section className="stack-medium">
        <div className="row-between">
          <div className="action-row">
            <h2 className="text-lg font-semibold">活跃订阅</h2>
            <Chip size="sm" variant="soft">
              {subscriptions.length}
            </Chip>
          </div>
          <Button onPress={openSubscription}>
            <Icon name="add" />
            添加订阅
          </Button>
        </div>
        <div className="subscription-row">
          {subscriptions.map((item) => (
            <Card key={item.name} className="subscription-card">
              <Card.Content>
                <div className="subscription-item">
                  <div className="subscription-item-header">
                    <div className="subscription-provider-cell">
                      <div className="subscription-provider-logo">
                        {item.logo ? <BrandLogo src={item.logo} /> : <Icon name="deployed_code" />}
                      </div>
                      <div className="subscription-item-copy">
                        <h3 className="subscription-item-title">{item.plan}</h3>
                        <p className="subscription-provider-name">{item.name}</p>
                      </div>
                    </div>
                    <div className="subscription-item-actions">
                      <IconAction
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`编辑 ${item.name} 订阅`}
                        onPress={() => detail(`编辑 ${item.name} 订阅（布局预览）`)}
                      >
                        <Icon name="edit_note" />
                      </IconAction>
                      <IconAction
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        aria-label={`删除 ${item.name} 订阅`}
                        onPress={() => detail(`删除 ${item.name} 订阅（布局预览）`)}
                      >
                        <Icon name="delete" />
                      </IconAction>
                    </div>
                  </div>
                  <div className="subscription-item-meta">
                    <p className="subscription-item-price">
                      ${item.price}
                      <span className="subscription-item-cycle"> / 月</span>
                    </p>
                    {item.renewal && (
                      <p className="subscription-renewal" aria-label={`下次续费 ${item.renewal}`}>
                        <Icon name="event" />
                        {item.renewal}
                      </p>
                    )}
                  </div>
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>
      </section>
      <section className="stack-medium">
        <div className="row-between">
          <h2 className="text-lg font-semibold">工具目录</h2>
          <Tabs selectedKey={category} onSelectionChange={(key) => setCategory(String(key))}>
            <Tabs.ListContainer>
              <Tabs.List aria-label="工具分类">
                {[
                  ['all', '全部'],
                  ['chat', '对话'],
                  ['code', '开发'],
                ].map(([key, label]) => (
                  <Tabs.Tab key={key} id={key}>
                    {label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>
        <div className="tool-grid">
          {tools
            .filter(
              (item) =>
                category === 'all' ||
                (category === 'chat' ? item.category === '对话' : item.category === '开发'),
            )
            .map((item) => {
              const openTool = () => detail(item.name)
              return (
                <Card
                  key={item.name}
                  className="tool-item"
                  role="button"
                  tabIndex={0}
                  aria-label={`打开 ${item.name}`}
                  onClick={openTool}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openTool()
                    }
                  }}
                >
                  <Card.Content>
                    <div className="tool-item-content">
                      <div className="tool-item-heading">
                        <div className="tool-item-icon">
                          <Icon name={item.icon} />
                        </div>
                        <div className="tool-item-copy">
                          <h3 className="tool-item-title">{item.name}</h3>
                          <p className="tool-item-provider">{item.provider}</p>
                        </div>
                      </div>
                      <p className="tool-item-description">{item.description}</p>
                      <div className="tool-item-footer">
                        <Chip size="sm" variant="soft">
                          {item.category}
                        </Chip>
                        <Icon name="arrow_forward" />
                      </div>
                    </div>
                  </Card.Content>
                </Card>
              )
            })}
        </div>
      </section>
    </div>
  )
}

function Dashboard({ detail }: { detail: Detail }) {
  const [focusing, setFocusing] = useState(false)
  return (
    <div className="dashboard-grid">
      <div className="stack-large">
        <div>
          <p className="text-sm text-muted">星期四，10 月 22 日</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            下午好，Dorck <span className="text-muted">☀</span>
          </h1>
          <p className="mt-3 text-sm text-muted">留一点空间，给今天最重要的想法。</p>
        </div>
        <Card>
          <Card.Header>
            <div className="row-between">
              <Card.Title>今日概览</Card.Title>
              <Button variant="ghost" size="sm" onPress={() => detail('项目管理')}>
                管理项目
                <Icon name="arrow_forward" />
              </Button>
            </div>
            <Card.Description>把注意力放在值得推进的事情上</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="three-columns">
              {[
                ['进行中的项目', '03'],
                ['今日待办', '06'],
                ['本周专注', '12.5 h'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted">{label}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <div className="business-divider" />
            <div className="row-between">
              <div>
                <p className="text-sm font-medium">MyDashboard · 创作工作台</p>
                <p className="mt-1 text-xs text-muted">下一步：完成 AI Lab 视觉升级</p>
              </div>
              <Chip size="sm" variant="soft">
                进行中
              </Chip>
            </div>
            <div className="mt-4">
              <Meter title="项目进度" value={72} />
            </div>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <div className="row-between">
              <Card.Title>优先任务</Card.Title>
              <Chip size="sm" variant="soft">
                今天 · 3 项
              </Chip>
            </div>
          </Card.Header>
          <Card.Content>
            <div className="stack-large">
              {['完成 HeroUI 设计稿与规范', '整理本周的创作素材', '为新文章收集研究资料'].map(
                (title, index) => (
                  <div className="row-between" key={title}>
                    <Check>{title}</Check>
                    <span className="text-xs text-muted">{index === 0 ? '优先' : '今天'}</span>
                  </div>
                ),
              )}
            </div>
          </Card.Content>
          <Card.Footer>
            <Button variant="tertiary" onPress={() => detail('新增任务')}>
              <Icon name="add" />
              添加任务
            </Button>
          </Card.Footer>
        </Card>
      </div>
      <aside className="stack-large">
        <Card>
          <Card.Header>
            <Card.Description>上海 · 晴</Card.Description>
            <div className="row-between">
              <p className="text-4xl font-semibold tabular-nums">24°</p>
              <Icon name="sunny" />
            </div>
          </Card.Header>
          <Card.Content>
            <p className="text-sm text-muted">适合散步，也适合让灵感发生。</p>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>专注时刻</Card.Title>
            <Card.Description>
              {focusing ? '专注演示进行中' : '给自己 25 分钟的完整时间'}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="text-center text-4xl font-semibold tabular-nums">25:00</p>
          </Card.Content>
          <Card.Footer>
            <Button
              variant={focusing ? 'secondary' : 'primary'}
              onPress={() => setFocusing(!focusing)}
            >
              <Icon name={focusing ? 'pause' : 'play_arrow'} />
              {focusing ? '结束专注演示' : '开始专注'}
            </Button>
          </Card.Footer>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>活跃记录</Card.Title>
            <Card.Description>本月持续创作 18 天</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="heatmap" aria-label="最近 28 天活跃度示意，18 个活跃日">
              {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                <p className="text-center text-xs text-muted" key={day}>
                  {day}
                </p>
              ))}
              {Array.from({ length: 28 }, (_, index) => (
                <span
                  key={index}
                  style={{ opacity: index % 4 === 0 ? 0.16 : ((index % 5) + 1) / 5 }}
                />
              ))}
            </div>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>灵感便签</Card.Title>
            <Card.Description>“让工具更安静，让创作更专注。”</Card.Description>
          </Card.Header>
          <Card.Footer>
            <Button variant="ghost" size="sm" onPress={() => detail('记录灵感')}>
              <Icon name="add" />
              记录灵感
            </Button>
          </Card.Footer>
        </Card>
      </aside>
    </div>
  )
}

function Writing({
  editor,
  navigate,
  detail,
}: {
  editor: boolean
  navigate: (page: string) => void
  detail: Detail
}) {
  const [search, setSearch] = useState('')
  const articles = [
    '让工作台回归内容本身',
    '一套更安静的 AI 创作流程',
    '从灵感到发布：我的写作方法',
  ]
  if (editor)
    return (
      <div className="stack-large">
        <div className="row-between">
          <Button variant="ghost" onPress={() => navigate('writing')}>
            <Icon name="arrow_back" />
            全部文章
          </Button>
          <div className="action-row">
            <span className="text-xs text-muted">正文排版预览</span>
            <Button onPress={() => detail('发布文章')}>
              发布
              <Icon name="arrow_outward" />
            </Button>
          </div>
        </div>
        <div className="action-row">
          <Button size="sm" variant="secondary" onPress={() => detail('格式工具')}>
            正文
            <Icon name="expand_more" />
          </Button>
          <Button size="sm" variant="ghost" onPress={() => detail('素材库')}>
            <Icon name="library_books" />
            资料库
          </Button>
          <Button size="sm" variant="ghost" onPress={() => detail('写作助手')}>
            <Icon name="auto_awesome" />
            写作助手
          </Button>
        </div>
        <article className="editor-paper">
          <p className="text-sm text-muted">设计随笔 · 草稿</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">让工作台回归内容本身</h1>
          <p className="mt-8">
            每天打开工作台，我们真正想看到的，是还没完成的想法、值得继续的项目，以及下一步可以做的小事。
          </p>
          <p>
            好的界面不需要不断提醒自己存在。它把相同的操作放在熟悉的位置，让内容拥有更清楚的层次。
          </p>
          <h2>从组件开始，减少选择</h2>
          <p>
            当按钮、字段、弹层都来自同一套语言，我们就能把更多时间放在创作上。这次的改版，从一个更简单的约定开始。
          </p>
          <blockquote>让工具安静下来，让想法有地方生长。</blockquote>
          <p className="text-sm text-muted">
            此处展示文章阅读与编辑排版。生产继续使用现有 Tiptap 编辑器。
          </p>
        </article>
      </div>
    )
  return (
    <div className="stack-large">
      <PageTitle title="Writing" description="把零散的想法，写成值得分享的内容。">
        <Button onPress={() => navigate('editor')}>
          <Icon name="add" />
          新建文章
        </Button>
      </PageTitle>
      <SearchField aria-label="搜索文章" value={search} onChange={setSearch}>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="搜索文章标题…" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <ContentTabs
        label="文章状态"
        items={[
          ['all', '全部文章'],
          ['draft', '草稿'],
        ]}
      >
        <div className="stack-medium mt-5">
          {articles
            .filter((title) => title.includes(search))
            .map((title, index) => (
              <Card key={title}>
                <Card.Header>
                  <div className="row-between">
                    <div className="stack-small">
                      <Chip size="sm" variant="soft">
                        草稿
                      </Chip>
                      <Card.Title>{title}</Card.Title>
                      <Card.Description>
                        从日常工作中整理经验，保留值得继续探索的想法。
                      </Card.Description>
                    </div>
                    <Button
                      variant="ghost"
                      onPress={() => navigate('editor')}
                      aria-label={`编辑 ${title}`}
                    >
                      <Icon name="arrow_outward" />
                    </Button>
                  </div>
                </Card.Header>
                <Card.Footer>
                  <span className="text-xs text-muted">
                    {1240 + index * 360} 字 · 今天 14:{30 + index * 5} 更新
                  </span>
                </Card.Footer>
              </Card>
            ))}
          {!articles.some((title) => title.includes(search)) && (
            <EmptyState>
              <p>没有匹配的文章</p>
              <Button variant="secondary" onPress={() => setSearch('')}>
                清除搜索
              </Button>
            </EmptyState>
          )}
        </div>
      </ContentTabs>
    </div>
  )
}

function Video({ openVoice, detail }: { openVoice: () => void; detail: Detail }) {
  return (
    <div className="stack-large">
      <PageTitle title="Video Studio" description="让画面、声音与故事，在这里相遇。">
        <Button onPress={openVoice}>
          <Icon name="mic" />
          AI Voiceover
        </Button>
      </PageTitle>
      <section className="stack-medium">
        <div className="row-between">
          <h2 className="text-lg font-semibold">视频封面</h2>
          <Button variant="secondary" size="sm" onPress={() => detail('导入封面')}>
            <Icon name="add" />
            导入封面
          </Button>
        </div>
        <div className="three-columns">
          {['创造，源于每一天', '我的 AI 工作流', '把灵感变成故事'].map((title, index) => (
            <Card key={title}>
              <Card.Content>
                <div className={`video-art video-art-${index}`}>
                  <span className="text-xs">MYDASHBOARD / CREATIVE NOTES</span>
                  <p className="text-2xl font-semibold">{title}</p>
                  <Icon name={index === 1 ? 'auto_awesome' : 'play_circle'} />
                </div>
              </Card.Content>
              <Card.Footer>
                <span className="text-sm">{title}</span>
                <IconAction
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  aria-label={`查看封面 ${title}`}
                  onPress={() => detail(title)}
                >
                  <Icon name="more_horiz" />
                </IconAction>
              </Card.Footer>
            </Card>
          ))}
        </div>
      </section>
      <div className="media-bottom">
        <Card>
          <Card.Header>
            <Card.Title>音频素材</Card.Title>
            <Card.Description>最近生成的声音与配乐</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="stack-large">
              {['创作流程 · 开场旁白', '项目介绍 · 女声'].map((title) => (
                <div className="action-row" key={title}>
                  <Button isIconOnly isDisabled variant="secondary" aria-label={`试听 ${title}`}>
                    <Icon name="play_arrow" />
                  </Button>
                  <div>
                    <p className="text-sm">{title}</p>
                    <p className="mt-1 text-xs text-muted">示例素材 · 无音频文件</p>
                  </div>
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>HTML 演示文稿</Card.Title>
            <Card.Description>为下一次分享做好准备</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="presentation-preview">
              <span className="text-xs text-muted">WORKSPACE NOTES / 2026</span>
              <h3 className="mt-5 text-3xl font-semibold tracking-tight">
                从想法到作品，
                <br />
                只差一次开始。
              </h3>
              <p className="mt-4 text-sm text-muted">MyDashboard · 创作方法分享</p>
            </div>
          </Card.Content>
          <Card.Footer>
            <Button variant="secondary" onPress={() => detail('演示文稿预览')}>
              打开演示
              <Icon name="arrow_outward" />
            </Button>
          </Card.Footer>
        </Card>
      </div>
    </div>
  )
}

function Insights({ detail }: { detail: Detail }) {
  return (
    <div className="stack-large">
      <PageTitle title="Insights" description="从信息中发现线索，让下一篇内容更有方向。">
        <Button variant="secondary" onPress={() => detail('热点信号')}>
          <Icon name="trending_up" />
          热点信号
        </Button>
        <Button onPress={() => detail('管理订阅源')}>
          <Icon name="rss_feed" />
          管理订阅源
        </Button>
      </PageTitle>
      <div className="insights-grid">
        <div className="stack-medium">
          {[
            '设计系统如何让团队减少重复决策',
            'AI 时代，创作者的工作流正在变化',
            '构建本地优先的个人知识空间',
          ].map((title, index) => (
            <Card key={title}>
              <Card.Header>
                <Card.Description>
                  {['设计观察', '产品周刊', '独立开发者'][index]} · 2 小时前
                </Card.Description>
                <Card.Title>{title}</Card.Title>
              </Card.Header>
              <Card.Content>
                <p className="text-sm text-muted">
                  从长期使用的细节出发，观察工具、内容与创作者之间的关系。
                </p>
              </Card.Content>
              <Card.Footer>
                <Chip size="sm" variant="soft">
                  {index === 0 ? '设计' : '技术'}
                </Chip>
                <Button variant="ghost" size="sm" onPress={() => detail(title)}>
                  阅读全文
                  <Icon name="arrow_forward" />
                </Button>
              </Card.Footer>
            </Card>
          ))}
        </div>
        <aside className="stack-large">
          <Card>
            <Card.Header>
              <Card.Title>平台概览</Card.Title>
              <Card.Description>最近 7 天 · 示例数据</Card.Description>
            </Card.Header>
            <Card.Content>
              <div className="stack-large">
                {[
                  ['掘金', '2,480', '+12%'],
                  ['小红书', '1,206', '+8%'],
                ].map(([name, amount, growth]) => (
                  <div className="row-between" key={name}>
                    <div>
                      <p className="text-sm">{name}</p>
                      <p className="mt-2 text-2xl font-semibold">{amount}</p>
                      <p className="text-xs text-muted">内容阅读</p>
                    </div>
                    <Chip color="success" size="sm" variant="soft">
                      {growth}
                    </Chip>
                  </div>
                ))}
              </div>
            </Card.Content>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Toolbox({ detail }: { detail: Detail }) {
  return (
    <div className="stack-large">
      <PageTitle title="Toolbox" description="集中管理个人工具，查看套餐用量与服务状态。">
        <Button onPress={() => detail('管理工具')}>
          <Icon name="tune" />
          管理工具
        </Button>
      </PageTitle>
      <div className="row-between">
        <h2 className="text-lg font-semibold">置顶工具</h2>
        <span className="text-xs text-muted">1 个工具</span>
      </div>
      <div className="two-columns">
        <Card>
          <Card.Header>
            <div className="row-between">
              <div className="action-row">
                <Icon name="send" />
                <Card.Title>Shadowsocks 套餐</Card.Title>
              </div>
              <Chip size="sm" variant="soft">
                只读用量
              </Chip>
            </div>
            <Card.Description>查看月流量配额、额外流量包与付款日期</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="stack-large">
              <Meter title="月流量已用" value={35} detail="70 / 200 GB" />
              <div className="two-columns">
                <div>
                  <p className="text-xs text-muted">月流量剩余</p>
                  <p className="mt-2 text-xl font-semibold">130 GB</p>
                </div>
                <div>
                  <p className="text-xs text-muted">额外包剩余</p>
                  <p className="mt-2 text-xl font-semibold">20 GB</p>
                </div>
              </div>
              <div className="stack-small text-sm">
                <div className="row-between">
                  <span className="text-muted">流量重置</span>
                  <span>2026-11-01</span>
                </div>
                <div className="row-between">
                  <span className="text-muted">下次付款</span>
                  <span>2026-11-01</span>
                </div>
                <div className="row-between">
                  <span className="text-muted">流量周期</span>
                  <span>每月</span>
                </div>
              </div>
              <p className="text-xs text-muted">示例数据 · 日期以官网为准，实际到期日期未知</p>
            </div>
          </Card.Content>
          <Card.Footer>
            <Button size="sm" variant="secondary" onPress={() => detail('刷新套餐用量')}>
              <Icon name="refresh" />
              刷新
            </Button>
            <Button size="sm" variant="ghost" onPress={() => detail('Shadowsocks 套餐配置')}>
              配置
            </Button>
            <IconAction
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="Shadowsocks 套餐排序与显示"
              onPress={() => detail('工具排序、置顶与显示')}
            >
              <Icon name="more_horiz" />
            </IconAction>
          </Card.Footer>
        </Card>
      </div>
      <Notice title="登录与隐私">
        官网登录、套餐选择、会话恢复、排序和刷新沿用现有业务。本稿使用示例用量，不访问账号或保存登录令牌。
      </Notice>
    </div>
  )
}

function Settings({
  theme,
  dark,
  setTheme,
  detail,
  primary,
  setPrimary,
}: {
  theme: string
  dark: boolean
  setTheme: (value: string) => void
  detail: Detail
  primary: string
  setPrimary: (value: string) => void
}) {
  const [draftPrimary, setDraftPrimary] = useState(primary || '#6B38D4')
  const [saved, setSaved] = useState(false)
  const validColor = /^#[\da-f]{6}$/i.test(draftPrimary)
  const pair = validColor ? primaryPair(draftPrimary, dark) : null
  const contrast = pair ? contrastRatio(pair.background, pair.foreground) : null
  return (
    <div className="stack-large settings-page">
      <PageTitle title="Settings" description="让工作区适应你的习惯。" />
      <Card>
        <Card.Header>
          <Card.Title>外观与主题</Card.Title>
          <Card.Description>沿用 MyDashboard 现有主题，支持浅色、深色与跟随系统。</Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="stack-large">
            <RadioGroup value={theme} onChange={setTheme} orientation="horizontal">
              <Label>颜色模式</Label>
              {themes.map(([key, title]) => (
                <Option key={key} value={key}>
                  {title}
                </Option>
              ))}
            </RadioGroup>
            <div className="business-divider" />
            <div className="stack-medium">
              <TextField
                value={draftPrimary}
                onChange={(value) => {
                  setDraftPrimary(value)
                  setSaved(false)
                }}
                isInvalid={!validColor}
              >
                <Label>界面主色</Label>
                <Input aria-label="界面主色" placeholder="#6B38D4" />
                <Description>沿用现有主色配对算法；仅保存到当前设计预览，刷新清除。</Description>
                <FieldError>请输入完整 HEX 颜色，例如 #6B38D4。</FieldError>
              </TextField>
              {contrast !== null && contrast < 4.5 && (
                <Notice status="warning" title="文字对比度不足">
                  当前模式下主要按钮文字为 {contrast.toFixed(2)}:1，低于 4.5:1。
                  建议改用更清晰的颜色；你仍可以保存此主色。
                </Notice>
              )}
              <div className="action-row">
                <Button
                  isDisabled={!validColor}
                  onPress={() => {
                    setPrimary(draftPrimary)
                    setSaved(true)
                  }}
                >
                  保存预览主色
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setPrimary('')
                    setDraftPrimary('#6B38D4')
                    setSaved(false)
                  }}
                >
                  恢复项目默认
                </Button>
              </div>
              {saved && (
                <p role="status" className="text-sm text-muted">
                  预览主色已保存，刷新后恢复项目默认。
                </p>
              )}
            </div>
          </div>
        </Card.Content>
      </Card>
      <Card>
        <Card.Header>
          <Card.Title>工作区</Card.Title>
          <Card.Description>管理通知和本地数据偏好</Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="stack-large">
            <Switch defaultSelected>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Label>任务完成通知</Label>
              </Switch.Content>
              <Description>配音和后台任务完成时通知我</Description>
            </Switch>
            <Switch defaultSelected>
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Label>本地备份提醒</Label>
              </Switch.Content>
              <Description>定期检查数据备份状态</Description>
            </Switch>
            <Choice
              label="显示语言"
              value="zh"
              options={[
                ['zh', '简体中文'],
                ['en', 'English'],
              ]}
              onChange={() => detail('界面语言设置')}
            />
          </div>
        </Card.Content>
        <Card.Footer>
          <Button variant="secondary" onPress={() => detail('备份与恢复')}>
            <Icon name="backup" />
            备份与恢复
          </Button>
        </Card.Footer>
      </Card>
      <p className="text-xs text-muted">设置项仅在设计稿内演示，不修改你的生产偏好。</p>
    </div>
  )
}

function Components({ detail }: { detail: Detail }) {
  const [model, setModel] = useState('voxcpm')
  return (
    <div className="stack-large">
      <PageTitle
        title="组件规范 · 2.0"
        description="真实 HeroUI 3.2.6，接入项目既有主题；组件形状和交互沿用公开 API。"
      />
      <Card>
        <Card.Header>
          <Card.Title>Button · 公开变体</Card.Title>
          <Card.Description>
            一个区域一个主要动作；通过键盘检查焦点，通过点击检查 pressed。
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="action-row flex-wrap">
            <Button data-testid="baseline-button" onPress={() => detail('主要操作')}>
              主要操作
            </Button>
            <Button variant="secondary" onPress={() => detail('次要操作')}>
              次要操作
            </Button>
            <Button variant="tertiary" onPress={() => detail('轻量操作')}>
              轻量操作
            </Button>
            <Button variant="ghost" onPress={() => detail('文字操作')}>
              文字操作
            </Button>
            <Button isDisabled>禁用</Button>
            <Button isPending>
              <Spinner size="sm" />
              处理中
            </Button>
          </div>
        </Card.Content>
      </Card>
      <div className="two-columns">
        <Card>
          <Card.Header>
            <Card.Title>表单与校验</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="stack-large">
              <TextField>
                <Label>项目名称</Label>
                <Input placeholder="例如：每周创作计划" />
                <Description>标签常驻，辅助信息说明用途</Description>
              </TextField>
              <TextField isInvalid value="" onChange={() => {}}>
                <Label>必填字段</Label>
                <Input placeholder="请输入名称" />
                <FieldError>请输入名称后再继续</FieldError>
              </TextField>
              <Choice
                label="模型"
                value={model}
                options={[
                  ['voxcpm', 'VoxCPM2'],
                  ['qwen', 'Qwen3-TTS'],
                ]}
                onChange={setModel}
              />
            </div>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>选择与连续数值</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="stack-large">
              <Check selected>保留生成记录</Check>
              <Check>仅显示已收藏</Check>
              <RadioGroup defaultValue="preset" orientation="horizontal">
                <Label>配音方式</Label>
                <Option value="preset">预设音色</Option>
                <Option value="clone">声音克隆</Option>
              </RadioGroup>
              <Switch defaultSelected>
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Label>任务通知</Label>
                </Switch.Content>
              </Switch>
              <Range label="语速" />
              <Meter title="任务进度" value={64} />
            </div>
          </Card.Content>
        </Card>
      </div>
      <div className="two-columns">
        <Card>
          <Card.Header>
            <Card.Title>Tabs · 内容导航</Card.Title>
          </Card.Header>
          <Card.Content>
            <ContentTabs
              label="组件内容导航"
              items={[
                ['overview', '概览'],
                ['history', '历史'],
              ]}
            >
              <p className="mt-4 text-sm text-muted">使用方向键在页签间切换，Tab 进入当前面板。</p>
            </ContentTabs>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>浮层与反馈</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="stack-medium">
              <Notice status="warning" title="连接暂不可用">
                保留输入，并提供明确的重试入口。
              </Notice>
              <Modal>
                <Button variant="secondary">打开嵌套浮层示例</Button>
                <Modal.Backdrop>
                  <Modal.Container>
                    <Modal.Dialog>
                      <Modal.CloseTrigger />
                      <Modal.Header>
                        <Modal.Heading>模型设置</Modal.Heading>
                      </Modal.Header>
                      <Modal.Body>
                        <Choice
                          label="弹窗内模型"
                          value={model}
                          options={[
                            ['voxcpm', 'VoxCPM2'],
                            ['qwen', 'Qwen3-TTS'],
                          ]}
                          onChange={setModel}
                        />
                        <p className="mt-4 text-sm text-muted">
                          Escape 先关闭选择列表，再关闭弹窗；焦点返回触发按钮。
                        </p>
                      </Modal.Body>
                    </Modal.Dialog>
                  </Modal.Container>
                </Modal.Backdrop>
              </Modal>
            </div>
          </Card.Content>
        </Card>
      </div>
      <p className="text-xs text-muted">
        完整 58
        类职责映射见采纳提案。此工作台重点覆盖高频控件与关键状态，未展示项仍须在生产迁移时逐项验收。
      </p>
    </div>
  )
}

function SubscriptionDialog({ add }: { add: (subscription: Subscription) => void }) {
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('openai')
  const [price, setPrice] = useState('20.00')
  const [invalid, setInvalid] = useState(false)
  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <Modal.Heading>添加订阅</Modal.Heading>
        <p className="text-sm text-muted">集中管理常用服务与月度成本</p>
      </Modal.Header>
      <Modal.Body>
        <div className="stack-large">
          <TextField value={name} onChange={setName} isInvalid={invalid && !name.trim()}>
            <Label>订阅名称</Label>
            <Input placeholder="例如：我的 ChatGPT Plus" />
            <FieldError>请输入订阅名称</FieldError>
          </TextField>
          <Choice
            label="服务商"
            value={provider}
            options={[
              ['openai', 'OpenAI'],
              ['anthropic', 'Anthropic'],
              ['google', 'Google'],
            ]}
            onChange={setProvider}
          />
          <TextField
            value={price}
            onChange={setPrice}
            isInvalid={
              invalid && (!price.trim() || !Number.isFinite(Number(price)) || Number(price) < 0)
            }
          >
            <Label>月费（USD）</Label>
            <Input type="number" min="0" step="0.01" />
            <FieldError>请输入不小于 0 的金额</FieldError>
          </TextField>
          <Description>设计演示：仅添加到当前预览，刷新后清除。</Description>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button
          onPress={() => {
            setInvalid(true)
            if (name.trim() && price.trim() && Number.isFinite(Number(price)) && Number(price) >= 0)
              add({
                name: name.trim(),
                plan: `${provider} · 自定义套餐`,
                price: Number(price).toFixed(2),
              })
          }}
        >
          添加到预览
        </Button>
      </Modal.Footer>
    </>
  )
}

type JobState = 'idle' | 'pending' | 'success' | 'error' | 'cancelled'

function useVoiceoverPreview(initialError: boolean) {
  const [tab, setTab] = useState('compose')
  const [mode, setMode] = useState('preset')
  const [engine, setEngine] = useState('voxcpm')
  const [voice, setVoice] = useState('xiaoxiao')
  const [language, setLanguage] = useState('zh')
  const [quality, setQuality] = useState('20')
  const [text, setText] = useState(
    '每一个值得记录的想法，都可以成为新的开始。打开 MyDashboard，让创作回到你熟悉的节奏。',
  )
  const [job, setJob] = useState<JobState>(initialError ? 'error' : 'idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const count = Array.from(text.trim()).length
  const generate = () => {
    if (job === 'pending' || !count || count > 300) return
    if (timer.current) clearTimeout(timer.current)
    setJob('pending')
    timer.current = setTimeout(() => setJob('success'), 2200)
  }
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    setJob('cancelled')
  }
  const previewError = () => {
    if (timer.current) clearTimeout(timer.current)
    setJob('error')
  }
  return {
    tab,
    setTab,
    mode,
    setMode,
    engine,
    setEngine,
    voice,
    setVoice,
    language,
    setLanguage,
    quality,
    setQuality,
    text,
    setText,
    job,
    count,
    generate,
    cancel,
    previewError,
  }
}

function Voiceover({ preview }: { preview: ReturnType<typeof useVoiceoverPreview> }) {
  const {
    tab,
    setTab,
    mode,
    setMode,
    engine,
    setEngine,
    voice,
    setVoice,
    language,
    setLanguage,
    quality,
    setQuality,
    text,
    setText,
    job,
    count,
    generate,
    cancel,
    previewError,
  } = preview
  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <div className="action-row">
          <Icon name="graphic_eq" />
          <div>
            <Modal.Heading>AI Voiceover</Modal.Heading>
            <p className="text-sm text-muted">用熟悉的声音，讲出新的灵感</p>
          </div>
        </div>
      </Modal.Header>
      <Modal.Body>
        <div className="voice-workspace">
          <div className="voice-editor">
            <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="配音工作区">
                  {[
                    ['compose', '配音'],
                    ['profiles', '我的音色'],
                    ['runtime', '本地模型'],
                  ].map(([key, title]) => (
                    <Tabs.Tab key={key} id={key}>
                      {title}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id="compose">
                <div className="stack-large mt-5">
                  <RadioGroup orientation="horizontal" value={mode} onChange={setMode}>
                    <Label>配音方式</Label>
                    <Option value="preset">预设音色</Option>
                    <Option value="clone">声音克隆</Option>
                  </RadioGroup>
                  {mode === 'preset' ? (
                    <>
                      <div className="two-columns">
                        <Choice
                          label="语言"
                          value={language}
                          options={[
                            ['zh', '中文'],
                            ['en', 'English'],
                          ]}
                          onChange={setLanguage}
                        />
                        <Choice
                          label="预设音色"
                          value={voice}
                          options={[
                            ['xiaoxiao', '晓晓 · 女声'],
                            ['yunxi', '云希 · 男声'],
                          ]}
                          onChange={setVoice}
                        />
                      </div>
                      <div className="three-columns">
                        <Range label="语速" />
                        <Range label="音调" min={-50} max={50} />
                        <Range label="音量" min={-50} max={50} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="two-columns">
                        <Choice
                          label="克隆引擎"
                          value={engine}
                          options={[
                            ['voxcpm', 'VoxCPM2'],
                            ['qwen', 'Qwen3-TTS'],
                          ]}
                          onChange={setEngine}
                        />
                        <Choice
                          label="我的音色"
                          value="narrator"
                          options={[['narrator', '我的旁白 · 示例']]}
                          onChange={() => {}}
                        />
                      </div>
                      {engine === 'voxcpm' ? (
                        <RadioGroup orientation="horizontal" value={quality} onChange={setQuality}>
                          <Label>生成质量</Label>
                          <Option value="20">精细 · 20 步</Option>
                          <Option value="10">快速 · 10 步</Option>
                        </RadioGroup>
                      ) : (
                        <Choice
                          label="生成语言"
                          value={language}
                          options={[
                            ['zh', '中文'],
                            ['en', 'English'],
                          ]}
                          onChange={setLanguage}
                        />
                      )}
                      <Accordion>
                        <Accordion.Item>
                          <Accordion.Heading>
                            <Accordion.Trigger>
                              高级参数
                              <Accordion.Indicator />
                            </Accordion.Trigger>
                          </Accordion.Heading>
                          <Accordion.Panel>
                            <Accordion.Body>
                              <div className="three-columns">
                                <TextField>
                                  <Label>
                                    {engine === 'voxcpm' ? '引导强度 CFG' : 'Temperature'}
                                  </Label>
                                  <Input
                                    type="number"
                                    defaultValue={engine === 'voxcpm' ? '2' : '0.7'}
                                    step="0.1"
                                  />
                                </TextField>
                                <TextField>
                                  <Label>随机种子</Label>
                                  <Input
                                    type="number"
                                    placeholder="随机"
                                    min="0"
                                    max="4294967295"
                                  />
                                </TextField>
                                <TextField>
                                  <Label>增益（dB）</Label>
                                  <Input type="number" defaultValue="0" min="-12" max="6" />
                                </TextField>
                              </div>
                            </Accordion.Body>
                          </Accordion.Panel>
                        </Accordion.Item>
                      </Accordion>
                      <Check selected>启用参考音频降噪</Check>
                      <Description>参考文本在后台识别，识别失败可重试。</Description>
                    </>
                  )}
                  <TextField value={text} onChange={setText} isInvalid={count > 300}>
                    <Label>配音文案</Label>
                    <TextArea rows={5} />
                    <Description>{count} / 300 字符 · 设计演示，不调用真实模型</Description>
                    <FieldError>文案最多 300 字符，请缩短后再生成</FieldError>
                  </TextField>
                  {job === 'error' && (
                    <Notice status="danger" title="生成失败">
                      模型连接中断。文案与参数已保留，可以重新生成。
                    </Notice>
                  )}
                  {job === 'success' && (
                    <Notice status="success" title="生成流程演示完成">
                      当前未创建真实音频，可继续调整参数或重新生成。
                    </Notice>
                  )}
                </div>
              </Tabs.Panel>
              <Tabs.Panel id="profiles">
                <div className="stack-large mt-5">
                  <Notice title="我的旁白 · 示例音色">参考音频已就绪 · 后台识别完成</Notice>
                  <TextField>
                    <Label>音色名称</Label>
                    <Input defaultValue="我的旁白" />
                  </TextField>
                  <Button variant="secondary" isDisabled>
                    <Icon name="upload_file" />
                    导入参考音频
                  </Button>
                  <Description>
                    此处为音色管理设计稿。生产入口继续使用系统文件选择，并保留导入、转写、重试与试听。
                  </Description>
                </div>
              </Tabs.Panel>
              <Tabs.Panel id="runtime">
                <div className="stack-large mt-5">
                  <Notice status="warning" title="本地环境尚未连接">
                    设计预览不读取本机模型。生产需检测引擎和降噪依赖的可用性。
                  </Notice>
                  <Card>
                    <Card.Header>
                      <Card.Title>VoxCPM2 / Qwen3-TTS</Card.Title>
                      <Card.Description>未检测 · 请在应用内配置</Card.Description>
                    </Card.Header>
                  </Card>
                </div>
              </Tabs.Panel>
            </Tabs>
          </div>
          <aside className="voice-jobs">
            <h3 className="text-sm font-semibold">生成任务</h3>
            <p className="mt-2 text-xs text-muted">任务状态始终可追踪</p>
            <div className="mt-5" role="status" aria-live="polite">
              {job === 'pending' ? (
                <div className="stack-medium">
                  <Spinner size="sm" />
                  <p className="text-sm">正在生成 · 设计演示</p>
                  <Button variant="secondary" size="sm" onPress={cancel}>
                    取消生成
                  </Button>
                </div>
              ) : (
                <div className="stack-medium">
                  <Icon
                    name={job === 'error' ? 'error' : job === 'success' ? 'task_alt' : 'audio_file'}
                  />
                  <p className="text-sm">
                    {
                      {
                        idle: '还没有生成任务',
                        pending: '',
                        success: '演示任务已完成',
                        error: '任务生成失败',
                        cancelled: '任务已取消',
                      }[job]
                    }
                  </p>
                  <p className="text-xs text-muted">
                    {job === 'idle' ? '填写文案后开始第一次配音。' : '文案和选择的参数会保留。'}
                  </p>
                  {job === 'error' && (
                    <Button size="sm" variant="secondary" onPress={generate}>
                      重试生成
                    </Button>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <div className="voice-footer">
          <div className="action-row">
            <Button isIconOnly isDisabled variant="secondary" aria-label="试听配音">
              <Icon name="play_arrow" />
            </Button>
            <div>
              <p className="text-sm">选择一段音频开始试听</p>
              <p className="text-xs text-muted">无真实音频 · 00:00 / 00:00</p>
            </div>
          </div>
          <div className="action-row">
            <Button variant="ghost" isDisabled={job === 'pending'} onPress={previewError}>
              预览失败
            </Button>
            <Button
              isDisabled={!count || count > 300}
              isPending={job === 'pending'}
              onPress={generate}
            >
              {job === 'pending' ? <Spinner size="sm" /> : <Icon name="auto_awesome" />}
              {job === 'pending' ? '生成中…' : '生成配音'}
            </Button>
          </div>
        </div>
      </Modal.Footer>
    </>
  )
}

function App() {
  const [page, setPage] = useState(query.get('page') || 'ai-lab')
  const [theme, setTheme] = useState(query.get('theme') || 'light')
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  const [primary, setPrimary] = useState('')
  const [state, setState] = useState(query.get('state') || 'ready')
  const voicePreview = useVoiceoverPreview(query.get('state') === 'error')
  const [dialog, setDialog] = useState(query.get('dialog') === 'voiceover' ? 'voiceover' : '')
  const [detailTitle, setDetailTitle] = useState('')
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions)
  const [globalSearch, setGlobalSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const detail = (title: string) => {
    setDetailTitle(title)
    setDialog('detail')
  }
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.classList.toggle('light', !dark)
    const root = document.documentElement
    if (primary) {
      const pair = primaryPair(primary, dark)
      root.style.setProperty('--accent', `rgb(${pair.background.join(' ')})`)
      root.style.setProperty('--accent-foreground', `rgb(${pair.foreground.join(' ')})`)
      root.style.setProperty('--focus', `rgb(${pair.background.join(' ')})`)
    } else {
      for (const role of ['--accent', '--accent-foreground', '--focus'])
        root.style.removeProperty(role)
    }
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark, primary])
  useEffect(() => {
    const params = new URLSearchParams({ page, theme, state })
    if (dialog === 'voiceover') params.set('dialog', dialog)
    history.replaceState(null, '', `?${params}`)
  }, [page, theme, state, dialog])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
  const navigate = (next: string) => {
    setPage(next)
    setState('ready')
    setGlobalSearch('')
  }
  const results = pages.filter(([, label]) =>
    label.toLowerCase().includes(globalSearch.toLowerCase()),
  )
  return (
    <>
      <div className="review-bar">
        <div className="action-row">
          <span className="review-mark">MD / 2.0</span>
          <span className="text-xs text-muted">UI 设计稿 · HeroUI 3.2.6</span>
        </div>
        <div className="review-controls">
          <span className="review-data text-xs text-muted">示例数据 · 2026-10-22</span>
          <Choice label="预览状态" value={state} options={states} onChange={setState} hideLabel />
          <Choice label="预览主题" value={theme} options={themes} onChange={setTheme} hideLabel />
        </div>
      </div>
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="brand">
            <img src={appLogo} alt="MyDashboard" />
            <div>
              <p className="text-lg font-semibold tracking-tight">MyDashboard</p>
              <p className="mt-1 text-xs text-muted">你的创作，从这里开始</p>
            </div>
          </div>
          <div className="new-project">
            <Button fullWidth onPress={() => detail('新建项目')}>
              <Icon name="add" />
              New Project
            </Button>
          </div>
          <nav aria-label="主导航" className="sidebar-nav">
            {pages.slice(0, 6).map(([key, label, icon]) => (
              <Link
                key={key}
                href={`?page=${key}&theme=${theme}&state=ready`}
                className="app-nav-item"
                aria-current={
                  page === key || (key === 'writing' && page === 'editor') ? 'page' : undefined
                }
                onClick={(event) => {
                  event.preventDefault()
                  navigate(key)
                }}
              >
                <Icon name={icon} />
                <span>{label}</span>
                {page === key && <span className="nav-current-dot" />}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            {pages.slice(6).map(([key, label, icon]) => (
              <Link
                key={key}
                href={`?page=${key}`}
                className="app-nav-item"
                aria-current={page === key ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  navigate(key)
                }}
              >
                <Icon name={icon} />
                {label}
              </Link>
            ))}
            <Button variant="secondary" fullWidth onPress={() => detail('个人资料')}>
              <Avatar size="sm">
                <Avatar.Fallback>D</Avatar.Fallback>
              </Avatar>
              Dorck · Workspace Owner
            </Button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="app-topbar">
            <div className="global-search">
              <SearchField aria-label="统一搜索" value={globalSearch} onChange={setGlobalSearch}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input ref={searchRef} placeholder="搜索页面、文章和灵感…" />
                  <Kbd>⌘ K</Kbd>
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
            </div>
            <div className="action-row">
              <IconAction
                variant="ghost"
                isIconOnly
                aria-label="通知中心"
                onPress={() => detail('通知中心')}
              >
                <Icon name="notifications" />
              </IconAction>
              <IconAction
                variant="ghost"
                isIconOnly
                aria-label="个人资料"
                onPress={() => detail('个人资料')}
              >
                <Avatar size="sm">
                  <Avatar.Fallback>D</Avatar.Fallback>
                </Avatar>
              </IconAction>
            </div>
          </header>
          <main className="page-scroll" id="main-content">
            <div className="page-content">
              {globalSearch ? (
                <div className="stack-large">
                  <PageTitle title="搜索结果" description={`当前预览匹配页面：“${globalSearch}”`} />
                  {results.map(([key, label]) => (
                    <Card key={key}>
                      <Card.Header>
                        <Card.Title>{label}</Card.Title>
                      </Card.Header>
                      <Card.Footer>
                        <Button variant="secondary" onPress={() => navigate(key)}>
                          打开页面
                        </Button>
                      </Card.Footer>
                    </Card>
                  ))}
                  {!results.length && (
                    <EmptyState>
                      <p>暂无匹配结果</p>
                      <Button onPress={() => setGlobalSearch('')}>清除搜索</Button>
                    </EmptyState>
                  )}
                </div>
              ) : (
                <>
                  {state === 'offline' && (
                    <div className="mb-6">
                      <Notice status="warning" title="当前离线">
                        正在展示缓存内容。联网操作将在连接恢复后可用。
                      </Notice>
                    </div>
                  )}
                  {!['ready', 'offline'].includes(state) ? (
                    <PageState state={state} reset={() => setState('ready')} />
                  ) : (
                    <>
                      {page === 'ai-lab' && (
                        <AILab
                          detail={detail}
                          subscriptions={subscriptions}
                          openSubscription={() => setDialog('subscription')}
                        />
                      )}
                      {page === 'dashboard' && <Dashboard detail={detail} />}
                      {['writing', 'editor'].includes(page) && (
                        <Writing editor={page === 'editor'} navigate={navigate} detail={detail} />
                      )}
                      {page === 'video' && (
                        <Video openVoice={() => setDialog('voiceover')} detail={detail} />
                      )}
                      {page === 'insights' && <Insights detail={detail} />}
                      {page === 'toolbox' && <Toolbox detail={detail} />}
                      {page === 'settings' && (
                        <Settings
                          theme={theme}
                          dark={dark}
                          setTheme={setTheme}
                          detail={detail}
                          primary={primary}
                          setPrimary={setPrimary}
                        />
                      )}
                      {page === 'components' && <Components detail={detail} />}
                    </>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
      <Modal.Backdrop
        isOpen={Boolean(dialog)}
        onOpenChange={(open) => {
          if (!open) setDialog('')
        }}
      >
        <Modal.Container
          size={dialog === 'voiceover' ? 'lg' : 'md'}
          placement="center"
          scroll="inside"
        >
          <Modal.Dialog className={dialog === 'voiceover' ? 'voice-dialog-layout' : undefined}>
            {dialog === 'voiceover' ? (
              <Voiceover preview={voicePreview} />
            ) : dialog === 'subscription' ? (
              <SubscriptionDialog
                add={(subscription) => {
                  setSubscriptions((current) => [...current, subscription])
                  setDialog('')
                }}
              />
            ) : (
              <>
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>{detailTitle}</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <div className="stack-large">
                    <Notice title="交互设计预览">
                      当前用于评审内容层级与弹窗行为，不连接生产数据。
                    </Notice>
                    <p className="text-sm text-muted">
                      {detailTitle === '重置历史'
                        ? '10 月 22 日 12:30 · 重置完成\n10 月 21 日 17:20 · 重置完成'
                        : detailTitle === '通知中心'
                          ? '配音任务完成、订阅提醒与系统消息在这里集中呈现。'
                          : '正式迁移时保留已有业务能力，使用当前 HeroUI 组件与交互规范。'}
                    </p>
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" onPress={() => setDialog('')}>
                    知道了
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
