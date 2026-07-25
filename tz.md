Привет! Нам нужно спроектировать и разработать одностраничное веб-приложение (SPA) — "Token UI Studio & Multi-Chain Registry". Это открытый веб-инструмент для настраиваемого реестра токенов и кастомизации карточек токенов через Server-Driven UI (SDUI).

Пожалуйста, помоги мне сгенерировать полную структуру и код приложения (один автономный HTML/JS файл index.html или модульный проект), учитывая следующие требования:

### 1. Архитектура данных (Мультисеть и SDUI)
Приложение должно работать с единым реестром JSON со следующей иерархией:
- **Networks** (массив сетей: Ethereum, BSC, Arbitrum, Solana и т.д.)
  - **Tokens** (список токенов/стейблкоинов для выбранной сети)
    - **Базовые поля:** name, symbol, type, id (address), decimals, website, description, status, tags.
    - **Секция SDUI `ui`:**
      - `theme`: { primaryColor, badgeText }
      - `background`: { type ("gradient"|"solid"), colors (массив HEX), angle }
    - **Секция SDUI `actions`:** словарь действий вида:
      - `external_url` ({ url, openIn })
      - `deeplink` ({ url })
      - `wallet_connect` ({ dappUrl })
    - **Секция SDUI `widgets`:** массив виджетов для рендеринга на карточке:
      - `banner`: { title, description, icon, action }
      - `action_group`: { title, items: [{ label, icon, action }] }

### 2. Пользовательский интерфейс (UI / UX Flow)
Приложение должно содержать 3 основные панели / области:

1. **Панель навигации по сетям и токенам (Sidebar / Selector):**
   - Выбор активной сети (Ethereum, BSC, Arbitrum).
   - Список токенов в выбранной сети с кнопкой "+ Добавить/Создать токен".

2. **Экран просмотра и интерактивной карточки (Live Mobile Wallet Simulator):**
   - Макет экрана мобильного кошелька (Phone Frame).
   - Отрисовка шапки токена с динамическим кастомным фоном (градиент/цвет из `ui.background`).
   - Отображение плашек/кастомных бейджей (`ui.theme.badgeText`).
   - Рендеринг пользовательских виджетов из `widgets`: баннеры миншинга/редемпшена, группы кнопок быстрой торговли/свапа/стейкинга.
   - Клик по виджетам должен имитировать выполнение действия (показывать демо-алерт с типом действия и целевым URL).

3. **Режим Редактора (JSON Editor & Visual Form):**
   - Редактирование JSON конфига выбранного токена с валидацией в реальном времени.
   - Пресеты: готовые примеры (USDT Yield с Минтом и Свапом, TWT Governance с DAO, RWA Bond с Редемпшеном).
   - Кнопка **"Deploy / Propose Token Card via GitHub"**:
     Генерирует прямую ссылку на Pull Request в GitHub репозиторий с предзаполненным файлом JSON, либо выгружает готовый файл конфига.

### 3. Требования к реализации
- Код должен быть чистым, с современным стильным интерфейсом (темная тема, CSS Grid/Flexbox).
- Использовать FontAwesome для иконок.
- Напиши полный рабочеспособный HTML/JS/CSS код для этого приложения, который можно сразу сохранить в index.html и запустить на бесплатном GitHub Pages.


Примеры

Для open-source кошелька это отличная фича, но тут важен баланс между гибкостью и гигиеной UX/безопасности. Если дать пользователям или эмитентам токенов полную свободу кастомизации (вплоть до выполнения произвольного кода), карточки мгновенно превратятся в «хаос из 2000-х» или создадут векторы для фишинга.Самый правильный инженерный подход здесь — SDUI (Server-Driven UI) на базе строго ограниченного набора виджетов и действий (Actions).Ниже спроектированная схема расширения вашего JSON-конфига, которая решает задачу кастомизации визуала, ссылок, действий и кастомных свапов/минтов.Архитектура расширения конфигаДобавим в корневой JSON три ключевых блока:ui — кастомизация оформления (бэкграунд, цвета, бейджи).actions — описания кастомных операций (Swap, Mint, Stake, Bridge, Redeem).widgets — декларативная разметка пользовательской секции карточки (кнопки, баннеры, списки действий).Пример итогового JSONJSON{
    "name": "Trust Wallet",
    "website": "https://trustwallet.com",
    "description": "Utility token to increase adoption of cryptocurrency.",
    "explorer": "https://bscscan.com/token/0x4B0F1812e5Df2A09796481Ff14017e6005508003",
    "type": "BEP20",
    "symbol": "TWT",
    "decimals": 18,
    "status": "active",
    "id": "0x4B0F1812e5Df2A09796481Ff14017e6005508003",
    "links": [
        { "name": "github", "url": "https://github.com/trustwallet/" },
        { "name": "x", "url": "https://x.com/TrustWalletApp" }
    ],
    "tags": ["governance"],

    "ui": {
        "theme": { "primaryColor": "#3375BB", "badgeText": "1:1 Backed" },
        "background": {
            "type": "gradient",
            "colors": ["#0B0E11", "#1E2329"],
            "angle": 135
        }
    },

    "actions": {
        "mint_dapp": {
            "type": "external_url",
            "url": "https://app.example.com/mint?token={symbol}",
            "openIn": "in_app_browser"
        },
        "custom_swap": {
            "type": "deeplink",
            "url": "mywallet://swap?from=USDT&to={id}&router=0xCustomRouterAddress"
        },
        "stake_action": {
            "type": "wallet_connect",
            "dappUrl": "https://stake.example.com"
        }
    },

    "widgets": [
        {
            "type": "banner",
            "title": "Mint & Redeem",
            "description": "Mint natively at 0% fee directly via protocol",
            "icon": "https://assets.example.com/mint-icon.svg",
            "action": "mint_dapp"
        },
        {
            "type": "action_group",
            "title": "Protocol Actions",
            "items": [
                {
                    "label": "Custom Swap",
                    "icon": "swap",
                    "action": "custom_swap"
                },
                {
                    "label": "Stake Yield (5% APY)",
                    "icon": "lock",
                    "action": "stake_action"
                }
            ]
        }
    ]
}
Детализация блоков1. Блок визуального стиля (ui)Позволяет сделать карточку уникальной, сохраняя целостность дизайна приложения.background:type: "solid" | "gradient" | "image_pattern"colors: Массив HEX-кодов.patternUrl: Ссылка на легкую векторную текстуру (только SVG/PNG с ограничением размера).theme:primaryColor: Акцентный цвет для кнопок/бордеров.badgeText: Короткая плашка на карточке (например, "Algo-Stable", "RWA", "Yield-Bearing").Безопасность visual-части: Ограничивайте загрузку фоновых картинок по размеру и доменам, либо разрешайте только градиенты и цвета, чтобы избежать трекинга IP через загрузку ресурсов.2. Блок логики действий (actions)Здесь объявляются все сценарии, которые могут происходить по клику. Это отделяет «что делать» от «как это выглядит».external_url: Открытие сайта/dApp в внешнем или In-App браузере. Поддерживает переменные типа {symbol}, {id}, {user_address}.deeplink: Внутренняя навигация кошелька (например, открытие экрана встроенного DEX с уже подставленными парами).wallet_connect: Быстрый коннект к dApp через встроенный WalletConnect-провайдер.3. Блок интерфейсных виджетов (widgets)Массив компонентов, которые рендерятся в выделенной пользовательской зоне карточки.Доступные типы виджетов:ВиджетОписаниеПример примененияbannerКарточка с заголовком, текстом, иконкой и одной главной кнопкой/кликомАнонс миншинга, предупреждение или промо протоколаaction_groupГоризонтальный или вертикальный список быстрых кнопокВызов Swap, Mint, Bridge, Claimkey_valueБлок метрик/информацииПоказатели типа Collateral Ratio: 150% или APY: 4.5%noticeИнформационный предупреждающий плашка"Token paused due to migration"Рекомендации по безопасности и UXСанкционирование и антифишинг:Разрешите вносить widgets и actions только для токенов, прошедших PR-проверку (Pull Request) в вашем open-source репозитории конфигов.Изоляция In-App Browser:Если кнопка ведет на кастомный сайт миншинга/обмена, открывайте его через защищенный WebView с явным предупреждением: "Вы переходите на сторонний dApp протокола X".Строгая валидация JSON Schema:На стороне приложения проверяйте этот JSON через JSON Schema. Если пользователь передал неизвестный widget.type, приложение должно просто проигнорировать этот элемент, а не падать.


https://github.com/trustwallet/developer/blob/master/assets/repository_details.md
тут взять Sample info.json для вдохновения.

Еще можно взять Whitelist tokens -
https://tokenlists.org/token-list?url=stablecoin.cmc.eth
чтобы было чем населять нашу схему.

Также стоит замоделироровать СХЕМУ JSON типа такой
https://raw.githubusercontent.com/Uniswap/token-lists/main/src/tokenlist.schema.json
