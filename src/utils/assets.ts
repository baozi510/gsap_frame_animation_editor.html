import { svgData } from './helpers'

export interface DemoAsset {
  id: string
  name: string
  src: string
}

export const demoAssets: DemoAsset[] = [
  {
    id: 'product',
    name: '产品主体',
    src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="520"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#8e78ff"/><stop offset="1" stop-color="#4d36ba"/></linearGradient></defs><rect width="720" height="520" rx="38" fill="#e8e9f0"/><ellipse cx="360" cy="431" rx="228" ry="39" fill="#c7c8d2"/><rect x="225" y="62" width="270" height="338" rx="56" fill="url(#g)"/><rect x="257" y="96" width="206" height="224" rx="36" fill="#fff" opacity=".94"/><rect x="295" y="130" width="130" height="24" rx="12" fill="#7a61ff" opacity=".25"/><circle cx="360" cy="362" r="17" fill="#fff"/></svg>`),
  },
  {
    id: 'room',
    name: '室内背景',
    src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs><linearGradient id="wall" y2="1"><stop stop-color="#f4f0eb"/><stop offset="1" stop-color="#dfd7ce"/></linearGradient><linearGradient id="glass" y2="1"><stop stop-color="#b7d9e5"/><stop offset="1" stop-color="#eaf4f7"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#wall)"/><rect y="1470" width="1080" height="450" fill="#ad856b"/><rect x="632" y="180" width="334" height="1150" rx="4" fill="#5e5148"/><rect x="656" y="207" width="286" height="1098" fill="url(#glass)"/><path d="M799 207v1098M656 710h286" stroke="#fff" stroke-width="14" opacity=".6"/><rect x="90" y="940" width="540" height="345" rx="60" fill="#cfbba7"/><rect x="117" y="870" width="185" height="150" rx="42" fill="#817062"/><rect x="390" y="875" width="176" height="142" rx="42" fill="#f5eee5"/><ellipse cx="367" cy="1485" rx="285" ry="55" fill="#7b5c4d" opacity=".18"/></svg>`),
  },
  {
    id: 'card',
    name: '卖点卡片',
    src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="260"><rect x="14" y="18" width="672" height="228" rx="42" fill="#fff" opacity=".96"/><circle cx="113" cy="132" r="52" fill="#7a61ff"/><path d="M91 132l17 17 31-37" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><rect x="194" y="83" width="300" height="30" rx="15" fill="#1f2430"/><rect x="194" y="137" width="390" height="22" rx="11" fill="#a9afbd"/><rect x="194" y="176" width="260" height="18" rx="9" fill="#d0d4dc"/></svg>`),
  },
  {
    id: 'badge',
    name: '装饰徽章',
    src: svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="340" height="340"><defs><linearGradient id="g" x1="0" x2="1" y2="1"><stop stop-color="#ffcf6b"/><stop offset="1" stop-color="#ff7f65"/></linearGradient></defs><path d="M170 20l40 48 62-6 7 62 48 40-42 46 10 62-62 11-35 51-50-37-60 17-17-60-55-30 31-54-25-57 58-22 24-58 58 18z" fill="url(#g)"/><circle cx="170" cy="170" r="85" fill="#fff" opacity=".93"/><path d="M132 170l25 25 53-62" fill="none" stroke="#ff8f5d" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></svg>`),
  },
]
