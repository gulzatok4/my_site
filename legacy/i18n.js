const LANG_KEY = "gulzat_lang_v1";
const LANGS = ["kk", "ru", "en"];

const I18N = {
  ru: {
    "nav.home": "Главная",
    "nav.shop": "Магазин",
    "nav.services": "Услуги",
    "nav.products": "Товары",
    "nav.cart": "Корзина",
    "nav.contact": "Связаться",
    "cart.title": "Корзина",
    "cart.close": "Закрыть корзину",
    "cart.checkout": "Оформить заказ",
    "cart.addMore": "Добавить ещё товары",
    "cart.clear": "Очистить корзину",
    "cart.empty": "Корзина пуста. Добавьте товары из магазина.",
    "cart.total": "Итого:",
    "cart.remove": "Удалить",
    "hero.l1": "Создаю решения,",
    "hero.l2": "которые помогают идее",
    "hero.l3": "стать результатом",
    "hero.p":
      "Я объединяю IT и творчество: системы, боты, сайты и CRM — рядом с ИИ-роликами, изделиями ручной работы и цветочными фотозонами.",
    "about.title": "Обо мне",
    "about.title.html": "<span>О</span>бо мне",
    "about.p1":
      "Меня зовут Gulzat, мне 38 лет. Основная деятельность связана с IT, внедрением и развитием цифровых решений: техническая поддержка, внедрение систем, работа с заказчиками и разработчиками, постановка задач. Также создаю ботов, сайты для продаж и CRM-системы.",
    "about.p2":
      "Параллельно воплощаю идеи руками: ИИ-ролики, изделия ручной работы и фотозоны из цветов. Люблю учиться новому и превращать обычную задумку во что-то особенное.",
    "about.write": "Написать",
    "work.title": "Чем я могу быть полезна",
    "work.it.title": "IT-системы",
    "work.it.p": "Поддержка, внедрение, задачи для разработки. Боты, сайты для продаж и CRM-системы.",
    "work.ai.title": "ИИ-ролики",
    "work.ai.p": "Ролики для бизнеса, рекламы, соцсетей и личных проектов. Идея, сценарий, визуал.",
    "work.craft.title": "Изделия ручной работы",
    "work.craft.p": "Шитьё и рукоделие на заказ. Национальные мотивы, декор, один экземпляр.",
    "work.photo.title": "Фотозоны",
    "work.photo.p": "Цветочные конструкции для свадеб, юбилеев, дней рождения и съёмок.",
    "shop.title": "Магазин",
    "shop.lead": "Товары и IT-услуги — выберите позицию и оформите заказ.",
    "shop.services": "Услуги",
    "shop.products": "Товары",
    "feat.service.title": "От идеи до рабочего результата",
    "feat.service.price": "Цена от 15 000 ₸ — по сложности заказа",
    "feat.service.desc": "Поддержка, внедрение систем, боты, сайты для продаж и CRM.",
    "feat.service.all": "Все услуги",
    "feat.product.title": "Ваш дизайн — наше исполнение",
    "feat.product.price": "Цена от 5 000 ₸ — индивидуальные заказы",
    "feat.product.desc": "Свадебные наборы, корзины, пуфы и другие изделия под ваш дизайн.",
    "feat.product.all": "Все товары",
    "order": "Заказать",
    "contact.title": "Давайте создадим что-то особенное вместе",
    "contact.mail.title": "Написать на почту",
    "contact.mail.name": "Ваше имя",
    "contact.mail.email": "Ваш email",
    "contact.mail.message": "Сообщение",
    "contact.mail.submit": "Открыть письмо",
    "contact.popup.title": "Связаться со мной",
    "contact.popup.lead": "Выберите удобный способ — отвечу как можно скорее.",
    "quote":
      "IT и творчество — не два направления. Их объединяет одно: идея → поиск решения → создание результата.",
    "footer.years": "15 лет практики",
    "footer.home": "На главную",
    "catalog.back": "← На главную",
    "catalog.products.kicker": "Главная · Товары",
    "catalog.products.title": "Все товары",
    "catalog.products.lead": "Выберите изделие, укажите количество и оформите заказ.",
    "catalog.services.kicker": "Главная · Услуги",
    "catalog.services.title": "Все услуги",
    "catalog.services.lead": "Выберите услугу и оформите заказ.",
    "catalog.products.count": "На сайте {n} {word}. Выберите изделие и оформите заказ.",
    "catalog.products.forms": "товар|товара|товаров",
    "catalog.products.empty": "Пока нет товаров в этой категории.",
    "catalog.services.count": "На сайте {n} {word}. Выберите и оформите заказ.",
    "catalog.services.forms": "услуга|услуги|услуг",
    "catalog.services.empty": "Пока нет услуг в этой категории.",
    "ui.qty": "Количество",
    "ui.less": "Меньше",
    "ui.more": "Больше",
    "ui.allCategories": "Все категории",
    "ui.categories": "Категории",
    "ui.cart": "Корзина",
    "ui.addCart": "В корзину",
    "ui.inCart": "В корзине:",
    "ui.inStock": "В наличии: {n} шт.",
    "ui.outOfStock": "Нет в наличии",
    "ui.product": "Товар",
    "ui.service": "Услуга",
    "ui.viewWork": "Смотреть работу",
    "order.greeting": "Здравствуйте, Гульзат! Хочу оформить заказ 😊",
    "order.qty": "Количество:",
    "order.pcs": "шт.",
    "order.sum": "Сумма:",
    "order.total": "Итого:",
    "order.name": "Имя:",
    "order.phone": "Телефон:",
    "order.servicePrice": "от 15 000 ₸ — по сложности заказа",
    "order.productPrice": "от 5 000 ₸ — индивидуальный заказ",
    "checkout.title": "Оформление заказа",
    "checkout.lead": "Оставьте имя и телефон — Гульзат свяжется с вами и подтвердит заказ.",
    "checkout.name": "Ваше имя",
    "checkout.namePh": "Например: Айгерим",
    "checkout.phone": "Номер телефона",
    "checkout.submitWa": "Перейти в WhatsApp",
    "checkout.errName": "Введите имя.",
    "checkout.errPhone": "Введите номер телефона полностью, например +7 777 123 45 67.",
    "checkout.close": "Закрыть",
    "checkout.color": "Цвет и пожелания",
    "checkout.colorPh": "Например: бордо с золотом",
    "checkout.dueDate": "К какой дате нужно",
    "checkout.comment": "Комментарий",
    "checkout.commentPh": "Размер, количество гостей, повод — всё, что важно",
    "checkout.optional": "необязательно",
    "checkout.terms": "Оплата — 100% предоплата. Доставка по городу и по Казахстану.",
    "checkout.termsLink": "Подробнее",
    "checkout.errDate": "Дата не может быть в прошлом.",
    "cart.plusOpen": "+ позиции «от …» — точную сумму подтвердит Гульзат",
    "cart.allOpen": "Стоимость подтвердит Гульзат после уточнения деталей.",
    "order.plusOpen": "+ позиции по договорённости",
    "order.color": "Цвет и пожелания:",
    "order.dueDate": "Нужно к дате:",
    "order.comment": "Комментарий:",
    "delivery.title": "Доставка и оплата",
    "delivery.make.title": "Изготовление",
    "delivery.make.p": "Изделия делаются вручную, чаще всего под ваш заказ. Срок зависит от изделия — согласуем его при подтверждении.",
    "delivery.pickup.title": "Самовывоз и доставка по городу",
    "delivery.pickup.p": "Заберите заказ сами или закажите курьера / такси. Адрес и стоимость доставки подскажем при подтверждении.",
    "delivery.kz.title": "Отправка по Казахстану",
    "delivery.kz.p": "Отправим почтой или транспортной компанией. Доставка оплачивается по тарифу перевозчика.",
    "delivery.pay.title": "Оплата",
    "delivery.pay.p": "Заказ запускается в работу после 100% предоплаты. Способ оплаты согласуем в WhatsApp.",
    "price.fromService": "от 15 000 ₸",
    "price.fromProduct": "от 5 000 ₸",
    "lang.kk": "ҚАЗ",
    "lang.ru": "РУС",
    "lang.en": "ENG",
    "page.title": "Gulzat",
    "page.productsTitle": "Товары — Gulzat",
    "page.servicesTitle": "Услуги — Gulzat",
  },
  kk: {
    "nav.home": "Басты бет",
    "nav.shop": "Дүкен",
    "nav.services": "Қызметтер",
    "nav.products": "Тауарлар",
    "nav.cart": "Себет",
    "nav.contact": "Байланыс",
    "cart.title": "Себет",
    "cart.close": "Себетті жабу",
    "cart.checkout": "Тапсырыс беру",
    "cart.addMore": "Тағы тауар қосу",
    "cart.clear": "Себетті тазалау",
    "cart.empty": "Себет бос. Дүкеннен тауар қосыңыз.",
    "cart.total": "Барлығы:",
    "cart.remove": "Жою",
    "hero.l1": "Шешімдер жасаймын,",
    "hero.l2": "идеяны нәтижеге",
    "hero.l3": "айналдыруға көмектеседі",
    "hero.p":
      "IT пен шығармашылықты біріктіремін: жүйелер, боттар, сайттар және CRM — ИИ-роликтер, қолөнер бұйымдары және гүл фотоаймақтарымен қатар.",
    "about.title": "Мен туралы",
    "about.title.html": "<span>М</span>ен туралы",
    "about.p1":
      "Менің атым Gulzat, жасым 38. Негізгі қызметім IT және цифрлық шешімдермен байланысты: техникалық қолдау, жүйелерді енгізу, тапсырыс берушілермен жұмыс. Сондай-ақ боттар, сату сайттары және CRM жасаймын.",
    "about.p2":
      "Қатар қолмен идеяларды жүзеге асырамын: ИИ-роликтер, қолөнер бұйымдары және гүл фотоаймақтары. Жаңаны үйреніп, қарапайым ойды ерекше нәтижеге айналдырғанды ұнатамын.",
    "about.write": "Жазу",
    "work.title": "Қалай пайдалы бола аламын",
    "work.it.title": "IT-жүйелер",
    "work.it.p": "Қолдау, енгізу, әзірлеу тапсырмалары. Боттар, сату сайттары және CRM.",
    "work.ai.title": "ИИ-роликтер",
    "work.ai.p": "Бизнес, жарнама, әлеуметтік желілер және жеке жобаларға роликтер.",
    "work.craft.title": "Қолөнер бұйымдары",
    "work.craft.p": "Тапсырыспен тігу және қолөнер. Ұлттық мотивтер, декор.",
    "work.photo.title": "Фотоаймақтар",
    "work.photo.p": "Үйлену тойы, мерейтой және түсірілімге гүл конструкциялары.",
    "shop.title": "Дүкен",
    "shop.lead": "Тауарлар мен IT-қызметтер — таңдап, тапсырыс беріңіз.",
    "shop.services": "Қызметтер",
    "shop.products": "Тауарлар",
    "feat.service.title": "Идеядан жұмыс нәтижесіне дейін",
    "feat.service.price": "Бағасы 15 000 ₸-ден — күрделілігіне қарай",
    "feat.service.desc": "Қолдау, жүйелерді енгізу, боттар, сайттар және CRM.",
    "feat.service.all": "Барлық қызметтер",
    "feat.product.title": "Сіздің дизайныңыз — біздің орындауымыз",
    "feat.product.price": "Бағасы 5 000 ₸-ден — жеке тапсырыс",
    "feat.product.desc": "Үйлену тойы жиынтықтары, себеттер, пуфтар және басқа бұйымдар.",
    "feat.product.all": "Барлық тауарлар",
    "order": "Тапсырыс беру",
    "contact.title": "Бірге ерекше бір нәрсе жасайық",
    "contact.mail.title": "Поштаға жазу",
    "contact.mail.name": "Атыңыз",
    "contact.mail.email": "Email",
    "contact.mail.message": "Хабарлама",
    "contact.mail.submit": "Хатты ашу",
    "contact.popup.title": "Менімен байланысу",
    "contact.popup.lead": "Ыңғайлы тәсілді таңдаңыз — мүмкіндігінше тез жауап беремін.",
    "quote":
      "IT пен шығармашылық — екі бағыт емес. Оларды біріктіретіні: идея → шешім → нәтиже.",
    "footer.years": "15 жыл тәжірибе",
    "footer.home": "Басты бетке",
    "catalog.back": "← Басты бетке",
    "catalog.products.kicker": "Басты бет · Тауарлар",
    "catalog.products.title": "Барлық тауарлар",
    "catalog.products.lead": "Бұйымды таңдап, санын көрсетіп, тапсырыс беріңіз.",
    "catalog.services.kicker": "Басты бет · Қызметтер",
    "catalog.services.title": "Барлық қызметтер",
    "catalog.services.lead": "Қызметті таңдап, тапсырыс беріңіз.",
    "catalog.products.count": "Сайтта {n} {word} бар. Бұйымды таңдап, тапсырыс беріңіз.",
    "catalog.products.forms": "тауар|тауар|тауар",
    "catalog.products.empty": "Бұл санатта әзірге тауар жоқ.",
    "catalog.services.count": "Сайтта {n} {word} бар. Таңдап, тапсырыс беріңіз.",
    "catalog.services.forms": "қызмет|қызмет|қызмет",
    "catalog.services.empty": "Бұл санатта әзірге қызмет жоқ.",
    "ui.qty": "Саны",
    "ui.less": "Азайту",
    "ui.more": "Көбейту",
    "ui.allCategories": "Барлық санаттар",
    "ui.categories": "Санаттар",
    "ui.cart": "Себет",
    "ui.addCart": "Себетке",
    "ui.inCart": "Себетте:",
    "ui.inStock": "Қоймада: {n} дана",
    "ui.outOfStock": "Қоймада жоқ",
    "ui.product": "Тауар",
    "ui.service": "Қызмет",
    "ui.viewWork": "Жұмысты көру",
    "order.greeting": "Сәлеметсіз бе, Гүлзат! Тапсырыс бергім келеді 😊",
    "order.qty": "Саны:",
    "order.pcs": "дана",
    "order.sum": "Сомасы:",
    "order.total": "Барлығы:",
    "order.name": "Аты:",
    "order.phone": "Телефон:",
    "order.servicePrice": "15 000 ₸-ден — күрделілігіне қарай",
    "order.productPrice": "5 000 ₸-ден — жеке тапсырыс",
    "checkout.title": "Тапсырысты рәсімдеу",
    "checkout.lead": "Атыңыз бен телефоныңызды қалдырыңыз — Гүлзат сізбен байланысып, тапсырысты растайды.",
    "checkout.name": "Атыңыз",
    "checkout.namePh": "Мысалы: Айгерім",
    "checkout.phone": "Телефон нөмірі",
    "checkout.submitWa": "WhatsApp-қа өту",
    "checkout.errName": "Атыңызды жазыңыз.",
    "checkout.errPhone": "Телефон нөмірін толық жазыңыз, мысалы +7 777 123 45 67.",
    "checkout.close": "Жабу",
    "checkout.color": "Түсі мен тілектер",
    "checkout.colorPh": "Мысалы: алтынмен бордо",
    "checkout.dueDate": "Қай күнге керек",
    "checkout.comment": "Пікір",
    "checkout.commentPh": "Өлшемі, қонақ саны, себебі — маңызды нәрсенің бәрі",
    "checkout.optional": "міндетті емес",
    "checkout.terms": "Төлем — 100% алдын ала төлем. Қала ішінде және Қазақстан бойынша жеткізу.",
    "checkout.termsLink": "Толығырақ",
    "checkout.errDate": "Күн өткен уақыт бола алмайды.",
    "cart.plusOpen": "+ «бастап» бағалы позициялар — нақты соманы Гүлзат растайды",
    "cart.allOpen": "Бағасын Гүлзат мәліметтерді нақтылағаннан кейін растайды.",
    "order.plusOpen": "+ келісім бойынша позициялар",
    "order.color": "Түсі мен тілектер:",
    "order.dueDate": "Қай күнге керек:",
    "order.comment": "Пікір:",
    "delivery.title": "Жеткізу және төлем",
    "delivery.make.title": "Дайындау",
    "delivery.make.p": "Бұйымдар қолмен, көбіне сіздің тапсырысыңызға жасалады. Мерзімі бұйымға байланысты — тапсырысты растағанда келісеміз.",
    "delivery.pickup.title": "Өзі алып кету және қала ішінде жеткізу",
    "delivery.pickup.p": "Тапсырысты өзіңіз алып кете аласыз немесе курьер / такси шақыра аласыз. Мекенжай мен жеткізу құнын растау кезінде айтамыз.",
    "delivery.kz.title": "Қазақстан бойынша жөнелту",
    "delivery.kz.p": "Поштамен немесе көлік компаниясымен жібереміз. Жеткізу тасымалдаушының тарифі бойынша төленеді.",
    "delivery.pay.title": "Төлем",
    "delivery.pay.p": "Тапсырыс 100% алдын ала төлемнен кейін жұмысқа алынады. Төлем тәсілін WhatsApp-та келісеміз.",
    "price.fromService": "15 000 ₸-ден",
    "price.fromProduct": "5 000 ₸-ден",
    "lang.kk": "ҚАЗ",
    "lang.ru": "РУС",
    "lang.en": "ENG",
    "page.title": "Gulzat",
    "page.productsTitle": "Тауарлар — Gulzat",
    "page.servicesTitle": "Қызметтер — Gulzat",
  },
  en: {
    "nav.home": "Home",
    "nav.shop": "Shop",
    "nav.services": "Services",
    "nav.products": "Products",
    "nav.cart": "Cart",
    "nav.contact": "Contact",
    "cart.title": "Cart",
    "cart.close": "Close cart",
    "cart.checkout": "Place order",
    "cart.addMore": "Add more products",
    "cart.clear": "Clear cart",
    "cart.empty": "Your cart is empty. Add items from the shop.",
    "cart.total": "Total:",
    "cart.remove": "Remove",
    "hero.l1": "I create solutions",
    "hero.l2": "that help an idea",
    "hero.l3": "become a result",
    "hero.p":
      "I combine IT and craft: systems, bots, websites and CRM — alongside AI videos, handmade pieces and floral photo zones.",
    "about.title": "About me",
    "about.title.html": "<span>A</span>bout me",
    "about.p1":
      "My name is Gulzat, I am 38. My main work is IT and digital solutions: support, system implementation, working with clients and developers. I also build bots, sales websites and CRM systems.",
    "about.p2":
      "In parallel I bring ideas to life by hand: AI videos, handmade pieces and floral photo zones. I love learning and turning a simple idea into something special.",
    "about.write": "Write",
    "work.title": "How I can help",
    "work.it.title": "IT systems",
    "work.it.p": "Support, implementation, development tasks. Bots, sales sites and CRM.",
    "work.ai.title": "AI videos",
    "work.ai.p": "Videos for business, ads, social media and personal projects.",
    "work.craft.title": "Handmade goods",
    "work.craft.p": "Custom sewing and crafts. National motifs, decor, one-of-a-kind pieces.",
    "work.photo.title": "Photo zones",
    "work.photo.p": "Floral setups for weddings, anniversaries, birthdays and shoots.",
    "shop.title": "Shop",
    "shop.lead": "Products and IT services — choose an item and place an order.",
    "shop.services": "Services",
    "shop.products": "Products",
    "feat.service.title": "From idea to working result",
    "feat.service.price": "From 15,000 ₸ — based on complexity",
    "feat.service.desc": "Support, system setup, bots, websites and CRM.",
    "feat.service.all": "All services",
    "feat.product.title": "Your design — our craft",
    "feat.product.price": "From 5,000 ₸ — custom orders",
    "feat.product.desc": "Wedding sets, baskets, poufs and other handmade pieces.",
    "feat.product.all": "All products",
    "order": "Order",
    "contact.title": "Let's create something special together",
    "contact.mail.title": "Email me",
    "contact.mail.name": "Your name",
    "contact.mail.email": "Your email",
    "contact.mail.message": "Message",
    "contact.mail.submit": "Open email",
    "contact.popup.title": "Get in touch",
    "contact.popup.lead": "Pick a convenient way — I'll reply as soon as I can.",
    "quote":
      "IT and craft are not two paths. What unites them: idea → solution → result.",
    "footer.years": "15 years of practice",
    "footer.home": "Home",
    "catalog.back": "← Home",
    "catalog.products.kicker": "Home · Products",
    "catalog.products.title": "All products",
    "catalog.products.lead": "Choose an item, set the quantity and place an order.",
    "catalog.services.kicker": "Home · Services",
    "catalog.services.title": "All services",
    "catalog.services.lead": "Choose a service and place an order.",
    "catalog.products.count": "{n} {word} on the site. Choose an item and place an order.",
    "catalog.products.forms": "product|products|products",
    "catalog.products.empty": "No products in this category yet.",
    "catalog.services.count": "{n} {word} on the site. Choose one and place an order.",
    "catalog.services.forms": "service|services|services",
    "catalog.services.empty": "No services in this category yet.",
    "ui.qty": "Quantity",
    "ui.less": "Decrease",
    "ui.more": "Increase",
    "ui.allCategories": "All categories",
    "ui.categories": "Categories",
    "ui.cart": "Cart",
    "ui.addCart": "Add to cart",
    "ui.inCart": "In cart:",
    "ui.inStock": "In stock: {n} pcs",
    "ui.outOfStock": "Out of stock",
    "ui.product": "Product",
    "ui.service": "Service",
    "ui.viewWork": "View work",
    "order.greeting": "Hello, Gulzat! I would like to place an order 😊",
    "order.qty": "Quantity:",
    "order.pcs": "pcs",
    "order.sum": "Total:",
    "order.total": "Total:",
    "order.name": "Name:",
    "order.phone": "Phone:",
    "order.servicePrice": "from 15,000 ₸ — based on complexity",
    "order.productPrice": "from 5,000 ₸ — custom order",
    "checkout.title": "Place an order",
    "checkout.lead": "Leave your name and phone — Gulzat will contact you to confirm the order.",
    "checkout.name": "Your name",
    "checkout.namePh": "e.g. Aigerim",
    "checkout.phone": "Phone number",
    "checkout.submitWa": "Continue to WhatsApp",
    "checkout.errName": "Please enter your name.",
    "checkout.errPhone": "Please enter the full phone number, e.g. +7 777 123 45 67.",
    "checkout.close": "Close",
    "checkout.color": "Color and wishes",
    "checkout.colorPh": "e.g. burgundy with gold",
    "checkout.dueDate": "Needed by",
    "checkout.comment": "Comment",
    "checkout.commentPh": "Size, number of guests, occasion — anything important",
    "checkout.optional": "optional",
    "checkout.terms": "Payment: 100% upfront. Delivery within the city and across Kazakhstan.",
    "checkout.termsLink": "Details",
    "checkout.errDate": "The date can't be in the past.",
    "cart.plusOpen": "+ “from” priced items — Gulzat will confirm the exact amount",
    "cart.allOpen": "Gulzat will confirm the price once the details are clear.",
    "order.plusOpen": "+ items priced on request",
    "order.color": "Color and wishes:",
    "order.dueDate": "Needed by:",
    "order.comment": "Comment:",
    "delivery.title": "Delivery and payment",
    "delivery.make.title": "Production",
    "delivery.make.p": "Items are handmade, usually to order. Timing depends on the item — we agree on it when confirming the order.",
    "delivery.pickup.title": "Pickup and city delivery",
    "delivery.pickup.p": "Pick up your order yourself or use a courier / taxi. We'll share the address and delivery cost when confirming.",
    "delivery.kz.title": "Shipping across Kazakhstan",
    "delivery.kz.p": "We ship by post or a transport company. Shipping is paid at the carrier's rates.",
    "delivery.pay.title": "Payment",
    "delivery.pay.p": "Work starts after 100% prepayment. We'll agree on the payment method in WhatsApp.",
    "price.fromService": "from 15,000 ₸",
    "price.fromProduct": "from 5,000 ₸",
    "lang.kk": "ҚАЗ",
    "lang.ru": "РУС",
    "lang.en": "ENG",
    "page.title": "Gulzat",
    "page.productsTitle": "Products — Gulzat",
    "page.servicesTitle": "Services — Gulzat",
  },
};

function normalizeLang(code) {
  const key = String(code || "").toLowerCase();
  if (key === "kz" || key === "kk" || key === "kaz") return "kk";
  if (key === "en" || key === "eng") return "en";
  return "ru";
}

function getLang() {
  try {
    return normalizeLang(localStorage.getItem(LANG_KEY) || "ru");
  } catch {
    return "ru";
  }
}

function setLang(code) {
  const lang = normalizeLang(code);
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang === "kk" ? "kk" : lang;
  applyI18n(lang);
  document.dispatchEvent(new CustomEvent("gulzat:lang", { detail: { lang } }));
  return lang;
}

function t(key, lang = getLang()) {
  const code = normalizeLang(lang);
  return I18N[code]?.[key] || I18N.ru[key] || key;
}

function applyI18n(lang = getLang()) {
  const code = normalizeLang(lang);
  document.documentElement.lang = code === "kk" ? "kk" : code;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const value = t(key, code);
    if (el.hasAttribute("data-i18n-html")) {
      el.innerHTML = value;
    } else {
      el.textContent = value;
    }
  });

  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key, code));
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.setAttribute("placeholder", t(key, code));
  });

  const titleKey = document.body?.getAttribute("data-i18n-title");
  if (titleKey) document.title = t(titleKey, code);

  document.querySelectorAll("[data-lang-cycle]").forEach((btn) => {
    btn.textContent = t(`lang.${code}`, code);
    btn.setAttribute("aria-label", `${t("lang.kk")} / ${t("lang.ru")} / ${t("lang.en")}`);
    btn.title = `${t("lang.kk")} / ${t("lang.ru")} / ${t("lang.en")}`;
  });

  document.querySelectorAll(".lang-switch [data-lang]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.getAttribute("data-lang") === code);
  });
}

function initLangSwitch() {
  document.querySelectorAll("[data-lang-cycle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const current = getLang();
      const idx = Math.max(0, LANGS.indexOf(current));
      setLang(LANGS[(idx + 1) % LANGS.length]);
    });
  });
  document.querySelectorAll(".lang-switch [data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.getAttribute("data-lang")));
  });
  applyI18n(getLang());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLangSwitch);
} else {
  initLangSwitch();
}
