import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.18.2/+esm"

const canvasEl = document.querySelector("canvas");
const textureEl = document.createElement("canvas");
const textureCtx = textureEl.getContext("2d");

const fontOptions = {
    "Arial": "Arial, sans-serif",
    "Verdana": "Verdana, sans-serif",
    "Tahoma": "Tahoma, sans-serif",
    "Times New Roman": "Times New Roman, serif",
    "Georgia": "Georgia, serif",
    "Garamond": "Garamond, serif",
    "Courier New": "Courier New, monospace",
    "Brush Script MT": "Brush Script MT, cursive"
}

const params = {
    fontName: "Verdana",
    isBold: true,
    fontSize: 80,
    text: "FRIDAY",
    pointerSize: null,
    colorStart: {r: 0.357, g: 0.376, b: 1},
    colorEnd: {r: 0.137, g: 0, b: 0.439},
    // color: {r: 0.357, g: 0.376, b: 1}
};

const pointer = {
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    moved: false,
};

const interactionState = {
    lastInteractionTime: Date.now(),
    previewDelay: 1000, // 3秒后重启预览
    previewStartTime: 0, // 记录预览动画开始时间，用于重置动画状态
};

let outputColor, velocity, divergence, pressure, canvasTexture;
let isPreview = true;

const gl = canvasEl.getContext("webgl", {
    alpha: true,  // 启用alpha通道
    premultipliedAlpha: false  // 禁用预乘alpha
});

gl.getExtension("OES_texture_float");

const vertexShader = createShader(
    document.getElementById("vertShader").innerHTML,
    gl.VERTEX_SHADER);

const splatProgram = createProgram("fragShaderPoint");
const divergenceProgram = createProgram("fragShaderDivergence");
const pressureProgram = createProgram("fragShaderPressure");
const gradientSubtractProgram = createProgram("fragShaderGradientSubtract");
const advectionProgram = createProgram("fragShaderAdvection");
const outputShaderProgram = createProgram("fragShaderOutputShader");

// 启用混合
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    -1, 1,
    1, 1,
    1, -1
]), gl.STATIC_DRAW);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(0);


function init() {
    createTextCanvasTexture();
    initFBOs();
    updateTextCanvas();
    setupEvents();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    render();

    // 添加初始文字显示
    gl.useProgram(splatProgram.program);
    gl.uniform1i(splatProgram.uniforms.u_input_texture, outputColor.read().attach(1));
    
    // 设置初始颜色
    const initialColor = {
        r: params.colorStart.r,
        g: params.colorStart.g,
        b: params.colorStart.b
    };
    
    // 在中心位置绘制一个点
    gl.uniform1f(splatProgram.uniforms.u_ratio, canvasEl.width / canvasEl.height);
    gl.uniform2f(splatProgram.uniforms.u_point, 0.5, 0.5);  // 在画布中心
    gl.uniform3f(splatProgram.uniforms.u_point_value, 1. - initialColor.r, 1. - initialColor.g, 1. - initialColor.b);
    gl.uniform1f(splatProgram.uniforms.u_point_size, params.pointerSize || 4 / window.innerHeight);
    
    blit(outputColor.write());
    outputColor.swap();
    
    window.addEventListener("resize", resizeCanvas);
    render();

}

function createTextCanvasTexture() {
    canvasTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, canvasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

// function updateTextCanvas() {
//     textureCtx.fillStyle = "black";
//     textureCtx.fillRect(0, 0, textureEl.width, textureEl.height);

//     textureCtx.font = (params.isBold ? "bold" : "normal") + " " + (params.fontSize * devicePixelRatio) + "px " + fontOptions[params.fontName];
//     textureCtx.fillStyle = "#ffffff";
//     textureCtx.textAlign = "center";

//     textureCtx.filter = "blur(3px)";

//     const textBox = textureCtx.measureText(params.text);
//     textureCtx.fillText(params.text, .5 * textureEl.width, .5 * textureEl.height + .5 * textBox.actualBoundingBoxAscent);

//     gl.activeTexture(gl.TEXTURE0);
//     gl.bindTexture(gl.TEXTURE_2D, canvasTexture);
//     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureEl);
// }

function updateTextCanvas() {
    // 清空画布
    textureCtx.clearRect(0, 0, textureEl.width, textureEl.height);

    // 加载并绘制 SVG 图像
    const img = new Image();
    img.src = 'logo.svg'; // 替换为您的 SVG 文件路径
    img.onload = () => {
        const logoWidth = window.innerWidth * 0.75; // 60% 的视口宽度
        const aspectRatio = img.height / img.width; // 计算图像的宽高比
        const logoHeight = logoWidth * aspectRatio; // 根据宽高比计算高度


        const x = (textureEl.width - logoWidth) / 2; // 横向居中
        const y = (textureEl.height - logoHeight) / 4;

        // 设置模糊效果
        textureCtx.filter = "blur(1px)";

        // 绘制图像
        textureCtx.drawImage(img, x, y, logoWidth, logoHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, canvasTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureEl);
    };
        
}

function createProgram(elId) {
    const shader = createShader(
        document.getElementById(elId).innerHTML,
        gl.FRAGMENT_SHADER);
    const program = createShaderProgram(vertexShader, shader);
    const uniforms = getUniforms(program);
    return {
        program, uniforms
    }
}

function createShaderProgram(vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Unable to initialize the shader program: " + gl.getProgramInfoLog(program));
        return null;
    }

    return program;
}

function getUniforms(program) {
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        let uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
}

function createShader(sourceCode, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, sourceCode);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function blit(target) {
    if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

function initFBOs() {
    const fboSize = [
        Math.floor(.5 * window.innerWidth),
        Math.floor(.5 * window.innerHeight),
    ]
    outputColor = createDoubleFBO(fboSize[0], fboSize[1]);
    velocity = createDoubleFBO(fboSize[0], fboSize[1], gl.RG);
    divergence = createFBO(fboSize[0], fboSize[1], gl.RGB);
    pressure = createDoubleFBO(fboSize[0], fboSize[1], gl.RGB);
}


function createFBO(w, h, type = gl.RGBA) {
    gl.activeTexture(gl.TEXTURE0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, type, w, h, 0, type, gl.FLOAT, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    // gl.clearColor(0.0, 0.0, 0.0, 0.0);  // 添加这行，设置清除颜色为完全透明
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
        fbo,
        width: w,
        height: h,
        attach(id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        }
    };
}

function createDoubleFBO(w, h, type) {
    let fbo1 = createFBO(w, h, type);
    let fbo2 = createFBO(w, h, type);

    return {
        width: w,
        height: h,
        texelSizeX: 1. / w,
        texelSizeY: 1. / h,
        read: () => {
            return fbo1;
        },
        write: () => {
            return fbo2;
        },
        swap() {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

// 在全局添加时间追踪变量
// const moveTracker = {
//     startTime: 0,
//     isMoving: false,
//     lastMoveTime: 0,
//     RESET_DELAY: 500 // 停止移动500ms后重置
// };

// function render(t) {
//     const dt = 1 / 60;

//     if (t && isPreview) {
//         updateMousePosition(
//             (.5 - .45 * Math.sin(.003 * t - 2)) * window.innerWidth,
//             (.5 + .1 * Math.sin(.0025 * t) + .1 * Math.cos(.002 * t)) * window.innerHeight
//         );
//     }

//     if (pointer.moved) {
//         if (!isPreview) {
//             pointer.moved = false;
//         }

//         // 更新移动追踪
//         const currentTime = Date.now();
//         if (!moveTracker.isMoving) {
//             moveTracker.startTime = currentTime;
//             moveTracker.isMoving = true;
//         }
//         moveTracker.lastMoveTime = currentTime;

//         gl.useProgram(splatProgram.program);
//         gl.uniform1i(splatProgram.uniforms.u_input_texture, velocity.read().attach(1));
//         gl.uniform1f(splatProgram.uniforms.u_ratio, canvasEl.width / canvasEl.height);
//         gl.uniform2f(splatProgram.uniforms.u_point, pointer.x / canvasEl.width, 1 - pointer.y / canvasEl.height);
//         gl.uniform3f(splatProgram.uniforms.u_point_value, pointer.dx, -pointer.dy, 1);
//         gl.uniform1f(splatProgram.uniforms.u_point_size, params.pointerSize);
//         blit(velocity.write());
//         velocity.swap();

//         gl.uniform1i(splatProgram.uniforms.u_input_texture, outputColor.read().attach(1));
        
//         // 计算基于移动时间的渐变因子
//         const moveDuration = currentTime - moveTracker.startTime;
//         const gradientFactor = Math.min(moveDuration / 2000, 1); // 2秒内完成渐变

//         // 在起始颜色(绿色)和结束颜色(蓝色)之间插值
//         const currentColor = {
//             r: 0,
//             g: 1 * (1 - gradientFactor), // 绿色逐渐减少
//             b: 1 * gradientFactor        // 蓝色逐渐增加
//         };

//         // 确保 currentColor 中的最大值为 1
//         const maxColorValue = Math.max(currentColor.r, currentColor.g, currentColor.b);
//         if (maxColorValue > 0) {
//             currentColor.r /= maxColorValue;
//             currentColor.g /= maxColorValue;
//             currentColor.b /= maxColorValue;
//         }

//         gl.uniform3f(splatProgram.uniforms.u_point_value, 1 - currentColor.r, 1 - currentColor.g, 1 - currentColor.b);
//         blit(outputColor.write());
//         outputColor.swap();
//     } else {
//         // 检查是否需要重置
//         const currentTime = Date.now();
//         if (moveTracker.isMoving && (currentTime - moveTracker.lastMoveTime > moveTracker.RESET_DELAY)) {
//             moveTracker.isMoving = false;
//         }
//     }

function render(t) {

    const dt = 1 / 180;
    const currentTime = Date.now();

    if (!isPreview && (currentTime - interactionState.lastInteractionTime > interactionState.previewDelay)) {
        isPreview = true;
        interactionState.previewStartTime = t; // 记录动画重启时的时间戳
    }

    if (t && isPreview) {
        // 调整时间偏移，使动画从初始位置重新开始
        const adjustedTime = t - interactionState.previewStartTime;
        updateMousePosition(
            (.5 - .6 * Math.sin(.002 * adjustedTime - 2)) * window.innerWidth,
            (.2 + .15 * Math.sin(.001 * adjustedTime) + .1 * Math.cos(.002 * adjustedTime)) * window.innerHeight
        );
    }

    // if (t && isPreview) {
    //     updateMousePosition(
    //         (.5 - .45 * Math.sin(.003 * t - 2)) * window.innerWidth,
    //         (.5 + .1 * Math.sin(.0025 * t) + .1 * Math.cos(.002 * t)) * window.innerHeight
    //     );
    // }

    if (pointer.moved) {
        if (!isPreview) {
            pointer.moved = false;
        }

        gl.useProgram(splatProgram.program);
        gl.uniform1i(splatProgram.uniforms.u_input_texture, velocity.read().attach(1));
        gl.uniform1f(splatProgram.uniforms.u_ratio, canvasEl.width / canvasEl.height);
        gl.uniform2f(splatProgram.uniforms.u_point, pointer.x / canvasEl.width, 1 - pointer.y / canvasEl.height);
        gl.uniform3f(splatProgram.uniforms.u_point_value, pointer.dx, -pointer.dy, 1);
        gl.uniform1f(splatProgram.uniforms.u_point_size, params.pointerSize);
        blit(velocity.write());
        velocity.swap();

        gl.uniform1i(splatProgram.uniforms.u_input_texture, outputColor.read().attach(1));
        
        // 计算基于指针x位置的渐变因子
        const gradientFactor = 0.5 * (1.0 + Math.sin(Math.PI * (pointer.x / canvasEl.width - 0.5)));

        // 在起始颜色和结束颜色之间插值
        const currentColor = {
            r: params.colorStart.r * (1 - gradientFactor) + params.colorEnd.r * gradientFactor,
            g: params.colorStart.g * (1 - gradientFactor) + params.colorEnd.g * gradientFactor,
            b: params.colorStart.b * (1 - gradientFactor) + params.colorEnd.b * gradientFactor
        };

        // 找到最大值并将其设置为1
        const maxColorValue = Math.max(currentColor.r, currentColor.g, currentColor.b);
        if (maxColorValue > 0) { // 确保最大值不为0
            // 确保最大值不为1
            const normalizationFactor = Math.min(maxColorValue, 1);
            currentColor.r /= normalizationFactor;
            currentColor.g /= normalizationFactor;
            currentColor.b /= normalizationFactor;
        }

        gl.uniform3f(splatProgram.uniforms.u_point_value, 1. - currentColor.r, 1. - currentColor.g, 1. - currentColor.b);

        // gl.uniform1i(splatProgram.uniforms.u_input_texture, outputColor.read().attach(1));
        // gl.uniform3f(splatProgram.uniforms.u_point_value, 1. - params.color.r, 1. - params.color.g, 1. - params.color.b);
        blit(outputColor.write());
        outputColor.swap();
    }

    gl.useProgram(divergenceProgram.program);
    gl.uniform2f(divergenceProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.u_velocity_texture, velocity.read().attach(1));
    blit(divergence);

    gl.useProgram(pressureProgram.program);
    gl.uniform2f(pressureProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.u_divergence_texture, divergence.attach(1));

    for (let i = 0; i < 10; i++) {
        gl.uniform1i(pressureProgram.uniforms.u_pressure_texture, pressure.read().attach(2));
        blit(pressure.write());
        pressure.swap();
    }

    gl.useProgram(gradientSubtractProgram.program);
    gl.uniform2f(gradientSubtractProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.u_pressure_texture, pressure.read().attach(1));
    gl.uniform1i(gradientSubtractProgram.uniforms.u_velocity_texture, velocity.read().attach(2));
    blit(velocity.write());
    velocity.swap();

    gl.useProgram(advectionProgram.program);
    gl.uniform1f(advectionProgram.uniforms.u_use_text, 0);
    gl.uniform2f(advectionProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.u_velocity_texture, velocity.read().attach(1));
    gl.uniform1i(advectionProgram.uniforms.u_input_texture, velocity.read().attach(1));
    gl.uniform1f(advectionProgram.uniforms.u_dt, dt);
    blit(velocity.write());
    velocity.swap();

    gl.useProgram(advectionProgram.program);
    gl.uniform1f(advectionProgram.uniforms.u_use_text, 1);
    gl.uniform2f(advectionProgram.uniforms.u_texel, outputColor.texelSizeX, outputColor.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.u_input_texture, outputColor.read().attach(2));
    gl.uniform1f(advectionProgram.uniforms.u_dissipation, 1.0); // 添加这行
    blit(outputColor.write());
    outputColor.swap();

    gl.useProgram(outputShaderProgram.program);
    gl.uniform1i(outputShaderProgram.uniforms.u_output_texture, outputColor.read().attach(1));

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(render);
}

function resizeCanvas() {
    params.pointerSize = 3 / window.innerHeight;
    canvasEl.width = textureEl.width = window.innerWidth;
    canvasEl.height = textureEl.height = window.innerHeight;
	 initFBOs();
    updateTextCanvas();
}

function setupEvents() {
    // canvasEl.addEventListener("mousemove", (e) => {
    //     isPreview = false;
    //     updateMousePosition(e.pageX, e.pageY);
    // });

    // canvasEl.addEventListener("touchmove", (e) => {
    //     e.preventDefault();
    //     isPreview = false;
    //     updateMousePosition(e.targetTouches[0].pageX, e.targetTouches[0].pageY);
    // });
    canvasEl.addEventListener("mousemove", (e) => {
        isPreview = false;
        interactionState.lastInteractionTime = Date.now();
        updateMousePosition(e.pageX, e.pageY);
    });

    canvasEl.addEventListener("touchmove", (e) => {
        e.preventDefault();
        isPreview = false;
        interactionState.lastInteractionTime = Date.now();
        updateMousePosition(e.targetTouches[0].pageX, e.targetTouches[0].pageY);
    });
}

function updateMousePosition(eX, eY) {
    pointer.moved = true;
    pointer.dx = 5 * (eX - pointer.x);
    pointer.dy = 5 * (eY - pointer.y);
    pointer.x = eX;
    pointer.y = eY;
}

window.addEventListener('load', init);