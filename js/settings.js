// settings.js — Logo interaction and theme switching

import { setBGMVolume } from './bgm.js';

export function initSettings() {
    const logoIcon = document.getElementById('logoIcon');
    const panel = document.getElementById('settingsPanel');
    const closeBtn = document.getElementById('settingsCloseBtn');

    // Toggle settings panel on logo click
    logoIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('hidden');
    });

    // Close button
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.add('hidden');
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!panel.classList.contains('hidden') &&
            !panel.contains(e.target) &&
            e.target !== logoIcon &&
            !logoIcon.contains(e.target)) {
            panel.classList.add('hidden');
        }
    });

    // Theme buttons
    const themeBtns = document.querySelectorAll('.settings-theme-btn');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            themeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setTheme(btn.dataset.theme);
        });
    });

    // Help button
    document.getElementById('settingsHelpBtn').addEventListener('click', () => {
        openHelpDialog();
    });

    // BGM volume slider
    const volumeSlider = document.getElementById('bgmVolumeSlider');
    const volumeValue = document.getElementById('bgmVolumeValue');
    volumeSlider.addEventListener('input', () => {
        const vol = parseInt(volumeSlider.value);
        volumeValue.textContent = vol + '%';
        setBGMVolume(vol / 100);
    });

    // About button
    document.getElementById('settingsAboutBtn').addEventListener('click', () => {
        openAboutDialog();
    });
}

function setTheme(theme) {
    document.body.classList.remove('theme-classic', 'theme-modern', 'theme-summer');
    document.body.classList.add(`theme-${theme}`);
}

function openHelpDialog() {
    if (document.getElementById('helpOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'helpOverlay';

    const dialog = document.createElement('div');
    dialog.id = 'helpDialog';

    // Title bar
    const titleBar = document.createElement('div');
    titleBar.className = 'help-titlebar';
    titleBar.innerHTML = '<span>HELP</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'help-close-btn';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', () => overlay.remove());
    titleBar.appendChild(closeBtn);
    dialog.appendChild(titleBar);

    // Body
    const body = document.createElement('div');
    body.className = 'help-body';
    body.innerHTML = `
<h3>画笔工具</h3>
<p>BRUSH — 自由绘制，可调节粗细（1-50px）</p>
<p>ERASER — 橡皮擦，擦除画布内容</p>
<p>FILL — 油漆桶，点击填充连通同色区域</p>
<p>BLUR — 模糊画笔，拖动局部模糊已有内容</p>

<h3>颜色与尺寸</h3>
<p>12色预设调色板 + RGB数值精确输入</p>
<p>滑块或数值框调整画笔粗细，实时预览</p>

<h3>历史操作</h3>
<p>UNDO — 撤回，最多30步</p>
<p>REDO — 取消撤回（新绘制会清空重做历史）</p>
<p>CLEAR — 一键清空画布</p>

<h3>文件操作</h3>
<p>SAVE — 导出画布为PNG图片（自动命名）</p>
<p>IMPORT — 导入图片，支持拖拽移动和缩放（按Shift解锁宽高比）</p>

<h3>图像处理</h3>
<p>EXTRACT — 一键提取线稿（Sobel边缘检测）</p>
<p>FILTER — 15种卷积滤镜（模糊/边缘/锐化/艺术/形态学），支持自定义3x3卷积核</p>
<p>f(x) — 像素数学，对R/G/B通道应用数学表达式变换颜色</p>

<h3>f(x) 表达式写法</h3>
<p>x 代表当前像素值（0~255），输入关于x的数学表达式即可。结果超出0~255会自动截断。勾选"Link R/G/B"可同步编辑三个通道，取消勾选则可分别设置。</p>

<h3>f(x) 示例</h3>
<p>· 反色：255-x</p>
<p>· 变暗：x*0.5</p>
<p>· 变亮：x*1.5</p>
<p>· 黑白二值化：x>128?255:0</p>
<p>· 色调分离：Math.floor(x/64)*85</p>
<p>· Gamma校正：Math.pow(x/255,1/2.2)*255</p>

<h3>f(x) 可用运算符</h3>
<p>+  加法，如 x+50</p>
<p>-  减法，如 255-x</p>
<p>*  乘法，如 x*0.8</p>
<p>/  除法，如 x/2</p>
<p>%  取余数（模运算），如 x%64，即x除以64的余数</p>
<p>**  幂运算，如 x**2 即x的平方</p>
<p>?:  条件判断，如 x>128?255:0，意为"若x大于128则取255，否则取0"</p>

<h3>f(x) 可用数学函数</h3>
<p>Math.floor(n) — 向下取整，如 Math.floor(3.7)=3</p>
<p>Math.ceil(n) — 向上取整，如 Math.ceil(3.2)=4</p>
<p>Math.round(n) — 四舍五入，如 Math.round(3.5)=4</p>
<p>Math.abs(n) — 绝对值，如 Math.abs(-5)=5</p>
<p>Math.pow(a,b) — a的b次方，如 Math.pow(x,2) 即x²</p>
<p>Math.sqrt(n) — 平方根，如 Math.sqrt(64)=8</p>
<p>Math.log(n) — 自然对数(ln)，如 Math.log(1)=0</p>
<p>Math.log2(n) — 以2为底的对数</p>
<p>Math.log10(n) — 以10为底的对数(lg)</p>
<p>Math.sin(n) — 正弦（弧度制），如 Math.sin(Math.PI/2)=1</p>
<p>Math.cos(n) — 余弦（弧度制）</p>
<p>Math.tan(n) — 正切（弧度制）</p>
<p>Math.min(a,b) — 取较小值，如 Math.min(x,200)</p>
<p>Math.max(a,b) — 取较大值，如 Math.max(x,50)</p>
<p>Math.random() — 随机数（0~1之间），如 x*Math.random()</p>
<p>Math.PI — 圆周率π ≈ 3.14159</p>
<p>Math.E — 自然常数e ≈ 2.71828</p>

<h3>AI 功能</h3>
<p>AUTO-COLOR — AI自动上色</p>
<p>FINISH DRAWING — AI补全未完成的画作</p>
<p>TEXT TO DRAW — 输入文字描述生成图像</p>
<p>STYLE TRANSFER — 风格迁移（油画/水彩/像素/漫画/素描/浮世绘）</p>

<h3>设置</h3>
<p>点击右上角Logo打开设置，可切换三种界面主题：Classic / Modern / Summer</p>
    `;
    dialog.appendChild(body);
    overlay.appendChild(dialog);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
}

function openAboutDialog() {
    if (document.getElementById('aboutOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'aboutOverlay';

    const dialog = document.createElement('div');
    dialog.id = 'aboutDialog';

    const titleBar = document.createElement('div');
    titleBar.className = 'about-titlebar';
    titleBar.innerHTML = '<span>ABOUT</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'about-close-btn';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', () => overlay.remove());
    titleBar.appendChild(closeBtn);
    dialog.appendChild(titleBar);

    const body = document.createElement('div');
    body.className = 'about-body';
    const img = document.createElement('img');
    img.src = 'pict/about.png';
    img.alt = 'About DRAW!';
    body.appendChild(img);
    dialog.appendChild(body);

    overlay.appendChild(dialog);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
}
