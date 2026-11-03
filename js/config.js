/**
 * ============================================================
 * config.js —— 全站内容与文案的「唯一数据源」
 * ------------------------------------------------------------
 * 设计约定（扩展接口）：
 *  1. 新增一个项目：往 PROJECTS 数组里 push 一个对象即可，
 *     项目展示区会自动多渲染一张卡片，无需改任何组件代码。
 *  2. 新增一段经历：往 TIMELINE 数组 push；新增技能组：往 SKILLS push。
 *  3. 新增演示视频：往 GALLERY push {title, video, poster, hint}。
 *  4. 部署后更新二维码指向：只需修改 SITE.url 一处（见文件末尾注释），
 *     或在页面「分享」弹窗里输入新地址并点击「设为默认地址」。
 *  5. 所有文案均为简历事实提取，未杜撰；标注 TODO 的字段可随时补充。
 * ============================================================
 */

export const SITE = {
  /** 站点部署后的最终地址（二维码指向）。
   *  部署到 GitHub Pages 后改成形如：
   *    https://<你的用户名>.github.io/<仓库名>/
   *  未部署前留空字符串 ''，页面会回退使用「当前访问地址」生成二维码。 */
  url: 'https://77z-ux.github.io/personal-space/',
  title: '赵佳杰 · 机器人系统开发',
  description: '机器人系统开发（嵌入式开发）｜ROS2 / STM32 / 运动控制 / 自主导航',

  /** 页脚访问计数（纯静态站点无后端，走第三方计数服务）
   *  enabled: false 可一键关闭；数据服务不可用时会自动降级/隐藏，不会显示假数据 */
  views: {
    enabled: true,
    provider: 'busuanzi',
  },
};

/**
 * 求职模式（Recruiter Mode）—— 给 HR 的一屏速览
 * ------------------------------------------------------------
 * 触发方式（三者任一）：
 *   1. 点导航右侧「招聘速览」按钮
 *   2. 链接直达：index.html?mode=recruiter
 *   3. 地址栏：index.html#/recruiter
 * 进入后会记住选择（localStorage），点「退出速览」或加 ?mode=full 可恢复完整页面。
 * 内容全部取自下方简历事实，未新增任何未经验证的信息。
 */
export const RECRUITER = {
  enabled: true,

  /** 顶部状态徽章：不给毕业年份等未确认信息下定论 */
  status: {
    label: '求职中',
    sub: '机器人 / 嵌入式 / ROS 2 方向 · 可实习',
  },

  /** 一屏能读完的自我定位（由下方履历事实压缩而来） */
  pitch:
    '机器人工程本科在读，GPA 3.66（专业前 5%）。做过 STM32 实时底盘与 ROS 2 定位导航的完整闭环，' +
    '也带队拿过国家级奖项 2 项、省级奖项 5 项。习惯把「能跑」做到「稳定跑」。',

  /** 关键数据条（数值与 PROFILE.stats 一致） */
  facts: [
    { value: '3.66', label: 'GPA / 4.0' },
    { value: '前 5%', label: '专业排名' },
    { value: '2 项', label: '国家级奖项（带队）' },
    { value: '5 项', label: '省级奖项（带队）' },
  ],

  /** 3 段最相关的经历：每条只留「做了什么 + 结果」 */
  experiences: [
    {
      period: '2026-06 ～ 2026-09',
      kicker: '实习',
      title: '机器人底盘开发 · 广东华南虎科技',
      points: [
        '负责 stemm 家庭陪伴机器人底盘上下位机与 ROS 2 定位导航开发',
        '打通「指令下发 — 底盘执行 — 状态反馈 — 定位更新」闭环，支持自主探索、目标位姿导航、地图保存与返航',
      ],
      tags: ['ROS 2 Humble', 'EKF', 'Cartographer', 'Nav2'],
    },
    {
      period: '2025-09 ～ 2026-06',
      kicker: '项目',
      title: '智慧药房自主配送机器人 · 全栈开发',
      points: [
        '上位机 ROS2 导航决策 + 下位机 STM32 实时底盘控制，自定义串口协议回传任务与里程状态',
        '激光 SLAM 建图 + AMCL 定位，完成任务状态机统筹「取样-识别-配送-回传」全流程',
      ],
      tags: ['RDK X3', 'Nav2', 'SLAM', '二维码识别'],
    },
    {
      period: '2025-07 ～ 至今',
      kicker: '校园',
      title: '机械创新工作室 · 负责人',
      points: [
        '统筹工科赛、工创赛、电赛等赛事与大创项目的选题评估、可行性分析与研发计划',
        '一年带领嵌入式开发组获国家级奖项 2 项、省级奖项 5 项，含嵌入式芯片系统设计大赛企业杯（Top 2）',
      ],
      tags: ['团队管理', '竞赛统筹', '嵌入式开发'],
    },
  ],

  /** 技术栈速览：从 SKILLS 里挑最相关的关键词（分组标题沿用原分组） */
  stack: [
    { group: '嵌入式', items: ['C/C++', 'STM32F407', 'FreeRTOS', '电机闭环控制'] },
    { group: '机器人', items: ['ROS 2 Humble', 'Nav2', 'Cartographer', 'EKF 融合'] },
    { group: '平台', items: ['Linux', 'Python', 'Git', 'CMake / colcon'] },
  ],

  /** 简历文件：留空则按钮变为「保存为 PDF」（浏览器打印，无需上传文件） */
  resumeFile: '',

  /** 速览页脚提示 */
  footerNote: '按 Esc 或点「退出速览」回到完整页面 · 链接加 ?mode=recruiter 可直接分享给 HR',
};

/** 个人基础信息（简历事实） */
export const PROFILE = {
  name: '赵佳杰',
  role: '机器人系统开发（嵌入式开发）',
  avatar: 'assets/img/avatar.png', // 像素风头像，替换只需覆盖同名文件
  age: 20,
  gender: '男',
  political: '共青团员',
  phone: '19830189385',
  email: 'JonyJ17@163.com',
  education: {
    school: '广东技术师范大学',
    major: '机器人工程（本科）',
    period: '2024-09 ～ 至今',
    gpa: '3.66 / 4.0',
    rank: '专业前 5%',
    courses: ['ROS2 入门与实践', '自动控制原理', '高等数学', '线性代数', '单片机微机原理'],
  },
  /** 首屏轮换展示的两句 Slogan（取自简历自我评价） */
  slogans: [
    '向下扎根千行码，向上生长万里程。',
    '赛场百炼识真章，代码千行见匠心。',
  ],
  /** 首屏数字看板（数值均为简历事实） */
  stats: [
    { value: 3.66, decimals: 2, suffix: '', label: 'GPA（满绩 4.0）' },
    { value: 5, decimals: 0, prefix: '前 ', suffix: '%', label: '专业排名' },
    { value: 2, decimals: 0, suffix: ' 项', label: '国家级奖项（带队）' },
    { value: 5, decimals: 0, suffix: ' 项', label: '省级奖项（带队）' },
  ],
};

/** 社交 / 仓库链接（简历中出现的事实链接） */
export const LINKS = [
  { key: 'github', label: 'GitHub', url: 'https://github.com/stemm-agent', note: 'stemm-agent（实习项目组织）' },
  { key: 'gitee', label: 'Gitee', url: 'https://gitee.com/JonyJ_17/rc_ws.git', note: 'RoboCup 项目开源仓库' },
  { key: 'email', label: 'Email', url: 'mailto:JonyJ17@163.com', note: 'JonyJ17@163.com' },
];

/** 经历时间线（教育 / 校园 / 实习，按时间倒序展示由组件处理） */
export const TIMELINE = [
  {
    date: '2024-09 ～ 至今',
    type: 'edu',
    title: '广东技术师范大学 · 机器人工程（本科）',
    org: '教育背景',
    points: [
      'GPA 3.66 / 4.0（专业前 5%）',
      '主修：ROS2 入门与实践、自动控制原理、高等数学、线性代数、单片机微机原理等',
    ],
    tags: ['机器人工程', 'GPA 3.66', '前 5%'],
  },
  {
    date: '2025-07 ～ 至今',
    type: 'campus',
    title: '机械创新工作室 · 工作室负责人',
    org: '校园经历',
    points: [
      '竞赛统筹：主导工科赛、工创赛、电赛、嵌入式芯片系统设计大赛等赛事与大创项目的选题评估、可行性分析、研发计划与经费管控',
      '技术攻关：深度参与嵌入式核心开发，负责项目进度管理与全流程跟进，协助研究生完成项目论文复现',
      '量化成果：一年带领嵌入式开发组获国家级奖项 2 项、省级奖项 5 项，含嵌入式芯片系统设计大赛企业杯（Top 2）',
    ],
    tags: ['团队管理', '竞赛统筹', '嵌入式开发'],
  },
  {
    date: '2026-06 ～ 2026-09',
    type: 'work',
    title: '广东华南虎科技有限公司 · 机器人底盘开发（实习）',
    org: '实习经历',
    points: [
      '负责 stemm 家庭陪伴机器人底盘上下位机与 ROS 2 定位导航开发',
      '打通「运动指令下发 — 底盘执行 — 状态反馈 — 定位更新」闭环，支持自主探索、目标位姿导航、地图保存与返航',
    ],
    tags: ['ROS 2 Humble', 'EKF', 'Cartographer', 'Nav2'],
  },
];

/** 荣誉奖项（简历事实，独立成带便于荣誉墙渲染） */
export const HONORS = [
  { name: '大学生创新训练项目（省级立项）', date: '2026-06 ～ 至今', level: '省级' },
  { name: '全国大学生电子设计竞赛 · 广东赛区二等奖', date: '2026', level: '省级', note: '全省 2200+ 队，H 题控制类热门方向' },
  { name: '中国机器人及人工智能大赛 · 广东赛区二等奖', date: '2026', level: '省级', note: '覆盖机器人感知、控制与人工智能多赛道' },
  { name: 'RoboCup 中国专项赛 · 区域赛三等奖', date: '2026', level: '国家级赛事区域赛', note: '国际顶级机器人赛事 RoboCup 中国区专项赛' },
  { name: '大学英语四级（CET-4）', date: '', level: '证书' },
];

/** 能力标签（按域分组，全部出自简历技术栈） */
export const SKILLS = [
  {
    group: '嵌入式与硬件',
    icon: '⚙',
    items: ['C/C++', 'STM32F407', 'FreeRTOS', 'UART / Modbus-RTU', '电机闭环控制', '麦克纳姆轮运动解算', 'PID / 陀螺仪前馈', '步进电机驱动'],
  },
  {
    group: '机器人与 ROS 2',
    icon: '⬡',
    items: ['ROS 2 Humble', 'Nav2', 'Cartographer', 'AMCL', 'EKF 多传感器融合', 'TF2 坐标链', 'explore_lite', 'State Lattice / RPP', 'SLAM 建图', 'RViz'],
  },
  {
    group: '视觉与感知',
    icon: '◉',
    items: ['MaxiCam2 视觉处理', '二维码 / 药盒视觉解析', '目标识别与测距', '二维激光雷达', 'IMU 数据融合'],
  },
  {
    group: '平台与工具链',
    icon: '⌘',
    items: ['Python', 'Linux', 'Git', 'CMake / colcon', 'RDK X3', 'RK3588', 'WebRTC / HTTP-FLV 图传', '多机通信'],
  },
];

/** 项目展示（含视频）。新增项目只需在此注册一个对象。 */
export const PROJECTS = [
  {
    id: 'pharmacy',
    title: '智慧药房自主配送机器人',
    subtitle: 'CRAIC 智慧药房赛道 · 全栈开发',
    period: '2025-09 ～ 2026-06',
    award: '中国机器人及人工智能大赛 · 广东赛区二等奖',
    desc: '面向智慧医疗场景，设计可在医院药房环境中自主完成药品取样、识别与配送的移动机器人：限定场地内自主规划路径、精准识别目标药品并完成取送全流程，模拟真实药房无人化配送。',
    highlights: [
      '搭建「上位机 ROS2 导航决策 + 下位机 STM32 实时底盘控制」协同架构，自定义串口协议完成任务指令、里程与状态回传',
      '基于激光 SLAM 建图与 AMCL 定位，实现取样点识别、药盒/二维码视觉解析、路径规划与精准停靠',
      '设计任务状态机统筹「取样-识别-配送-回传」全流程，解决定位丢帧、底盘延迟与多模块联调时序冲突',
    ],
    tech: ['RDK X3', 'ROS 2 Humble', 'STM32', 'FreeRTOS', 'Nav2', 'SLAM', '二维码识别'],
    video: 'assets/videos/pharmacy.mp4',
    poster: 'assets/posters/pharmacy.jpg',
    posterW: 1920,
    posterH: 1080,
    orientation: 'landscape',
  },
  {
    id: 'robocup',
    title: '智能物流搬运移动平台',
    subtitle: 'RoboCup 中国专项赛 · 嵌入式软件开发',
    period: '2026-08 ～ 2026-10',
    award: 'RoboCup 中国专项赛 · 区域赛三等奖',
    desc: '围绕智能仓储物流场景，设计具备全向移动能力的物料搬运机器人：在模拟仓库环境中自主识别物料位置、完成抓取与转运，贴合工业自动化物流需求。',
    highlights: [
      '基于 STM32F407 设计嵌入式控制系统，编写麦克纳姆轮运动解算，实现任意方向平移与原地转向',
      '移植调试 MaxiCam2 视觉处理单元，完成物料特征识别与目标测距，实现自主目标定位',
      '打通「视觉识别 → 主控决策 → 底盘运动 + 机械臂动作」多模块通信链路，构建完整任务闭环',
    ],
    tech: ['STM32F407VET6', 'MaxiCam2', '麦克纳姆轮全向底盘', '转盘式物料收取机构', '多机通信'],
    video: 'assets/videos/robocup.mp4',
    poster: 'assets/posters/robocup.jpg',
    posterW: 1280,
    posterH: 720,
    orientation: 'landscape',
    repo: 'https://gitee.com/JonyJ_17/rc_ws.git',
  },
  {
    id: 'balance-ball',
    title: '车载平衡滚球运动控制系统',
    subtitle: '全国大学生电子设计竞赛 H 题 · 嵌入式软件开发',
    period: '2026-08',
    award: '全国大学生电子设计竞赛 · 广东赛区二等奖',
    desc: '以「车载平衡滚球」为赛题背景，设计集底盘循迹、摆杆平衡与滚球控制于一体的运动控制系统：行驶过程中保持钢球稳定于摆杆平台，同时完成规定路径循迹。',
    highlights: [
      '设计「底盘循迹 + 摆杆平衡 + 视觉滚球」三级分布式架构，STM32 主控驱动四路闭环电机',
      '采用「轨迹 + 摆杆 + 视觉」复合控制，实现高精度循迹与 ±5cm 阶跃响应（稳态误差 < 0.5cm）',
      'RK3588 视觉平台经 UART（Modbus-RTU）直控电机；Wi-Fi 局域网下基于 WebRTC/HTTP-FLV 实现 720p@30fps、<50ms 低延迟图传',
      '循迹一圈 13 秒，停车偏差 < 1cm，各项指标满足赛题要求',
    ],
    tech: ['STM32F407VET6', 'RK3588', 'Modbus-RTU', 'WebRTC', 'PID / 陀螺仪前馈'],
    video: 'assets/videos/balance-ball.mp4',
    poster: 'assets/posters/balance-ball.jpg',
    posterW: 720,
    posterH: 750,
    orientation: 'portrait',
  },
  {
    id: 'stemm',
    title: 'stemm 家庭陪伴机器人（实习项目）',
    subtitle: '广东华南虎科技 · 底盘上下位机与 ROS 2 定位导航开发',
    period: '2026-06 ～ 2026-09',
    award: '',
    desc: '基于差速底盘、二维激光雷达、轮速里程计和 IMU，开展底盘上下位机通信、状态估计、激光建图及自主导航的集成与二次开发，支持自主探索、目标位置与朝向导航、地图保存和返航。',
    highlights: [
      '对接 ROS 2 速度话题与下位机通信协议，完成运动指令封包、反馈解包、单位转换及校验，适配成品轮毂电机执行接口',
      '接入底盘运动反馈、IMU 与激光数据，发布里程计及传感器话题，配置联调 EKF 融合、TF 坐标链与数据时效',
      '基于 Cartographer 实现二维激光建图与地图保存，AMCL 实现保存地图模式定位',
      '集成 explore_lite 与 Nav2，采用含原地旋转的差速 State Lattice 原语，二次开发精确目标朝向、返航分段跟踪与足迹碰撞检查',
    ],
    tech: ['C/C++', 'Python', 'Linux', 'ROS 2 Humble', 'UART', 'TF2', 'EKF', 'Cartographer', 'AMCL', 'Nav2'],
    video: 'assets/videos/stemm.mp4',
    poster: 'assets/posters/stemm.jpg',
    posterW: 1280,
    posterH: 720,
    orientation: 'landscape',
    repo: 'https://github.com/stemm-agent',
  },
];

/** 更多演示视频（素材文件名即标题，未额外杜撰说明） */
export const GALLERY = [
  {
    title: '寻找声源 · 导航避障',
    video: 'assets/videos/sound-nav.mp4',
    poster: 'assets/posters/sound-nav.jpg',
    posterW: 720,
    posterH: 1280,
    orientation: 'portrait',
    hint: '声源定位 + 自主导航避障演示',
  },
  {
    title: '小车自动回充',
    video: 'assets/videos/auto-charge.mp4',
    poster: 'assets/posters/auto-charge.jpg',
    posterW: 720,
    posterH: 1280,
    orientation: 'portrait',
    hint: '自动回充对接演示',
  },
];

/** 联系方式模块 */
export const CONTACT = {
  title: '联系我',
  items: [
    { icon: '✆', label: '电话', value: '19830189385', href: 'tel:19830189385' },
    { icon: '✉', label: '邮箱', value: 'JonyJ17@163.com', href: 'mailto:JonyJ17@163.com' },
    { icon: '⌂', label: '学校', value: '广东技术师范大学 · 机器人工程', href: '' },
  ],
  footerLine: '赛场百炼识真章，代码千行见匠心。',
};

/** 音效与动效开关（true/false 改变全局行为） */
export const FX = {
  particles: true,      // 粒子+网格背景
  typewriterSpeed: 90,  // Slogan 打字机速度(ms/字)
  revealThreshold: 0.15,// 滚动入场触发阈值
};
