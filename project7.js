function toRad(deg) {
	return deg * (Math.PI / 180);
}

function scaleMatrix(sx, sy, sz) {
	return new Float32Array([
		sx, 0, 0, 0,
		0, sy, 0, 0,
		0, 0, sz, 0,
		0, 0, 0, 1
	]);
}

function createVec3(x = 0, y = 0, z = 0) {
	return { x, y, z };
}

function multiplyMatrixAndPoint(m, v) {
	return {
		x: m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12],
		y: m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13],
		z: m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14],
	};
}

function multiplyMatrices(a, b) {
	let result = new Float32Array(16);

	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 4; j++) {
			result[i + j * 4] =
				a[i + 0 * 4] * b[0 + j * 4] +
				a[i + 1 * 4] * b[1 + j * 4] +
				a[i + 2 * 4] * b[2 + j * 4] +
				a[i + 3 * 4] * b[3 + j * 4];
		}
	}
	return result;
}

function translationMatrix(tx, ty, tz) {
	return new Float32Array([
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		tx, ty, tz, 1
	]);
}

function rotationMatrixY(angle) {
	let cosA = Math.cos(angle);
	let sinA = Math.sin(angle);
	return new Float32Array([
		cosA, 0, -sinA, 0,
		0, 1, 0, 0,
		sinA, 0, cosA, 0,
		0, 0, 0, 1
	]);
}

function perspectiveMatrix(fov, aspect, near, far) {
	let f = 1.0 / Math.tan(fov / 2);
	let range = near - far;
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, (far + near) / range, -1,
		0, 0, (2 * far * near) / range, 0
	]);
}

function normalizeVec3(x, y, z) {
	const len = Math.hypot(x, y, z);
	if (len === 0) return { x: 0, y: 0, z: 0 };
	return { x: x / len, y: y / len, z: z / len };
}

function cross(a, b) {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x,
	};
}

function dot(a, b) {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

function lookAt(eye, center, up) {
	const f = normalizeVec3(
		center.x - eye.x,
		center.y - eye.y,
		center.z - eye.z
	);

	const s = normalizeVec3(
		...(Object.values(cross(f, up)))
	);

	const u = cross(s, f);

	const m = new Float32Array(16);

	m[0] = s.x; m[1] = s.y; m[2] = s.z; m[3] = 0;
	m[4] = u.x; m[5] = u.y; m[6] = u.z; m[7] = 0;
	m[8] = -f.x; m[9] = -f.y; m[10] = -f.z; m[11] = 0;
	m[12] = -dot(s, eye);
	m[13] = -dot(u, eye);
	m[14] = dot(f, eye);
	m[15] = 1;

	return m;
}

function cameraCollides(newX, newZ, cameraY, scene) {
	const radius = 0.2;

	for (const obj of scene.gameObjects) {
		if (obj.isLight) continue;

		const t = obj.transform;

		const halfX = 0.5 * t.scale.x + radius;
		const halfY = 0.5 * t.scale.y + radius;
		const halfZ = 0.5 * t.scale.z + radius;

		const dx = newX - t.position.x;
		const dy = cameraY - t.position.y;
		const dz = newZ - t.position.z;

		if (Math.abs(dx) <= halfX &&
			Math.abs(dy) <= halfY &&
			Math.abs(dz) <= halfZ) {
			return obj;
		}
	}
	return null;
}

class Transform {
	constructor(x = 0, y = 0, z = 0) {
		this.position = createVec3(x, y, z);
		this.rotation = createVec3(0, 0, 0);
		this.scale = createVec3(1, 1, 1);
		this.modelMatrix = new Float32Array(16);
		this.recalculateModelMatrix();
	}

	recalculateModelMatrix() {
		const rotMat = rotationMatrixY(this.rotation.y);
		const transMat = translationMatrix(this.position.x, this.position.y, this.position.z);
		const scaleMat = scaleMatrix(this.scale.x, this.scale.y, this.scale.z);

		const rotScale = multiplyMatrices(rotMat, scaleMat);
		this.modelMatrix = multiplyMatrices(transMat, rotScale);
	}
}

class Camera {
	constructor(gl, width, height) {
		this.gl = gl;
		this.fov = Math.PI / 4;
		this.aspect = width / height;
		this.near = 0.1;
		this.far = 100;
		this.projectionMatrix = perspectiveMatrix(this.fov, this.aspect, this.near, this.far);

		this.position = createVec3(0, 0, 5);
		this.pitch = 0;
		this.yaw = 0;
		this.forward = createVec3(0, 0, -1);
		this.up = createVec3(0, 1, 0);

		this.recalculateViewMatrix();
	}

	recalculateViewMatrix(offsetX = 0, offsetY = 0) {
		let sensitivity = 0.1;
		offsetX *= sensitivity;
		offsetY *= sensitivity;

		this.yaw += offsetX;
		this.pitch += offsetY;

		this.pitch = Math.max(-89, Math.min(89, this.pitch));

		const radYaw = this.yaw * (Math.PI / 180);
		const radPitch = this.pitch * (Math.PI / 180);

		this.forward = createVec3(
			Math.cos(radPitch) * Math.sin(radYaw),
			Math.sin(radPitch),
			-Math.cos(radPitch) * Math.cos(radYaw)
		);

		const center = {
			x: this.position.x + this.forward.x,
			y: this.position.y + this.forward.y,
			z: this.position.z + this.forward.z,
		};

		this.viewMatrix = lookAt(this.position, center, this.up);
		console.log(this.viewMatrix)
	}
}

class Shader {
	constructor(gl, vs, fs) {
		this.gl = gl;
		this.program = gl.createProgram();

		const vShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vShader, vs);
		gl.compileShader(vShader);
		if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) {
			console.error("Vertex Shader Error:", gl.getShaderInfoLog(vShader));
		}

		const fShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fShader, fs);
		gl.compileShader(fShader);
		if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) {
			console.error("Fragment Shader Error:", gl.getShaderInfoLog(fShader));
		}

		gl.attachShader(this.program, vShader);
		gl.attachShader(this.program, fShader);
		gl.linkProgram(this.program);
		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
			console.error("Program Link Error:", gl.getProgramInfoLog(this.program));
		}

		this.locations = {
			position: gl.getAttribLocation(this.program, "a_position"),
			color: gl.getAttribLocation(this.program, "a_color"),
			modelViewMatrix: gl.getUniformLocation(this.program, "u_modelViewMatrix"),
			projectionMatrix: gl.getUniformLocation(this.program, "u_projectionMatrix"),
			lightPosView: gl.getUniformLocation(this.program, "u_lightPosView"),
			isLight: gl.getUniformLocation(this.program, "u_isLight"),
			texCoord: gl.getAttribLocation(this.program, "a_texCoord"),
			sampler: gl.getUniformLocation(this.program, "u_texture"),

		};
	}
	activate() {
		this.gl.useProgram(this.program);
	}
}

class VertexBufferObject {
	constructor(gl, data) {
		this.gl = gl;
		this.buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
	}
	bind() { this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer); }
	unbind() { this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null); }
}

class ElementBufferObject {
	constructor(gl, data) {
		this.gl = gl;
		this.buffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
	}
	bind() { this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffer); }
	unbind() { this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null); }
}

class VAO {
	constructor(gl) {
		this.gl = gl;
		this.vao = gl.createVertexArray();
	}
	bind() { this.gl.bindVertexArray(this.vao); }
	unbind() { this.gl.bindVertexArray(null); }

	linkAttrib(vbo, layout, size, type, stride, offset) {
		const gl = this.gl;
		vbo.bind();
		gl.vertexAttribPointer(layout, size, type, false, stride, offset);
		gl.enableVertexAttribArray(layout);
		vbo.unbind();
	}
}

class Input {
	constructor(canvas) {
		/** @type {HTMLCanvasElement} */
		this.canvas = canvas;
		this.mouseDeltaX = 0;
		this.mouseDeltaY = 0;
		this.lastMousePos = { x: 0, y: 0 };
		this.keys = new Map();

		window.addEventListener("keydown", this.onKeyDown.bind(this));
		window.addEventListener("keyup", this.onKeyUp.bind(this));
		window.addEventListener("mousemove", this.onMouseMove.bind(this));
		window.addEventListener("click", this.onMouseClick.bind(this));
	}

	getKeys() {
		return this.keys;
	}

	onKeyDown(event) {
		this.keys.set(event.key.toLowerCase(), true);
	}
	onKeyUp(event) {
		this.keys.set(event.key.toLowerCase(), false);
	}

	onMouseMove(event) {
		this.mouseDeltaX = event.movementX;
		this.mouseDeltaY = event.movementY;
	}

	getChangeInMousePos() {
		const dx = this.mouseDeltaX || 0;
		const dy = this.mouseDeltaY || 0;

		this.mouseDeltaX = 0;
		this.mouseDeltaY = 0;

		return { x: dx, y: dy };
	}

	async onMouseClick(event) {
		const rect = this.canvas.getBoundingClientRect();
		if (
			event.clientX < rect.left ||
			event.clientX > rect.right ||
			event.clientY < rect.top ||
			event.clientY > rect.bottom
		) {
			return;
		}
		await this.canvas.requestPointerLock();

	}
}

class Geometry {
	constructor(gl, vertices, indices, attribLocations) {
		this.gl = gl;
		this.indexCount = indices.length;

		this.vbo = new VertexBufferObject(gl, vertices);
		this.ebo = new ElementBufferObject(gl, indices);
		this.vao = new VAO(gl);

		this.vao.bind();
		this.ebo.bind();

		const stride = 8 * Float32Array.BYTES_PER_ELEMENT;
		const colorOffset = 3 * Float32Array.BYTES_PER_ELEMENT;

		this.vao.linkAttrib(this.vbo, attribLocations.position, 3, gl.FLOAT, stride, 0);
		this.vao.linkAttrib(this.vbo, attribLocations.color, 3, gl.FLOAT, stride, colorOffset);
		this.vao.linkAttrib(this.vbo, attribLocations)

		this.vao.unbind();
		this.ebo.unbind();
	}

	draw() {
		this.gl.drawElements(this.gl.TRIANGLES, this.indexCount, this.gl.UNSIGNED_SHORT, 0);
	}
}

class Material {
	constructor(gl, shader) {
		this.gl = gl;
		this.shader = shader;
	}

	useShader() {
		this.shader.activate();
	}

	setUniforms(modelMatrix, viewMatrix, projectionMatrix) {
		const gl = this.gl;

		const modelViewMatrix = multiplyMatrices(viewMatrix, modelMatrix);

		gl.uniformMatrix4fv(this.shader.locations.modelViewMatrix, false, modelViewMatrix);
		gl.uniformMatrix4fv(this.shader.locations.projectionMatrix, false, projectionMatrix);
	}
}

class GameObject {
	constructor(gl, geometry, material) {
		this.gl = gl;
		this.transform = new Transform();
		this.geometry = geometry;
		this.material = material;
		this.isLight = false;
	}

	update(deltaTime) {
		this.transform.recalculateModelMatrix();
	}

	draw(camera, lightPosView) {
		this.material.useShader();
		this.material.setUniforms(
			this.transform.modelMatrix,
			camera.viewMatrix,
			camera.projectionMatrix
		);

		const gl = this.gl;

		const isLight = this.isLight ? 1 : 0;
		const isLightLoc = this.material.shader.locations.isLight;
		if (isLightLoc) {
			gl.uniform1i(isLightLoc, isLight);
		}

		const lpLoc = this.material.shader.locations.lightPosView;
		if (lpLoc) {
			gl.uniform3f(lpLoc, lightPosView.x, lightPosView.y, lightPosView.z);
		}

		this.geometry.vao.bind();
		this.geometry.draw();
		this.geometry.vao.unbind();
	}
}

class Scene {
	constructor() {
		this.gameObjects = [];
	}

	add(gameObject) {
		this.gameObjects.push(gameObject);
	}

	update(deltaTime) {
		this.gameObjects.forEach(obj => obj.update(deltaTime));
	}
}

class Renderer {
	constructor(gl) {
		this.gl = gl;
		gl.enable(gl.DEPTH_TEST);
	}

	render(scene, camera, lightPosView) {
		const gl = this.gl;
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		scene.gameObjects.forEach(obj => {
			obj.draw(camera, lightPosView);
		});
	}
}

const cubeVertices = new Float32Array([
	-0.5, -0.5, 0.5, 1.0, 0.0, 0.0,
	0.5, -0.5, 0.5, 1.0, 0.0, 0.0,
	0.5, 0.5, 0.5, 1.0, 0.0, 0.0,
	-0.5, 0.5, 0.5, 1.0, 0.0, 0.0,

	-0.5, -0.5, -0.5, 0.0, 1.0, 0.0,
	-0.5, 0.5, -0.5, 0.0, 1.0, 0.0,
	0.5, 0.5, -0.5, 0.0, 1.0, 0.0,
	0.5, -0.5, -0.5, 0.0, 1.0, 0.0,

	-0.5, 0.5, 0.5, 0.0, 0.0, 1.0,
	0.5, 0.5, 0.5, 0.0, 0.0, 1.0,
	0.5, 0.5, -0.5, 0.0, 0.0, 1.0,
	-0.5, 0.5, -0.5, 0.0, 0.0, 1.0,

	-0.5, -0.5, 0.5, 1.0, 1.0, 0.0,
	0.5, -0.5, 0.5, 1.0, 1.0, 0.0,
	0.5, -0.5, -0.5, 1.0, 1.0, 0.0,
	-0.5, -0.5, -0.5, 1.0, 1.0, 0.0,

	0.5, -0.5, 0.5, 0.0, 1.0, 1.0,
	0.5, 0.5, 0.5, 0.0, 1.0, 1.0,
	0.5, 0.5, -0.5, 0.0, 1.0, 1.0,
	0.5, -0.5, -0.5, 0.0, 1.0, 1.0,

	-0.5, -0.5, 0.5, 1.0, 0.0, 1.0,
	-0.5, -0.5, -0.5, 1.0, 0.0, 1.0,
	-0.5, 0.5, -0.5, 1.0, 0.0, 1.0,
	-0.5, 0.5, 0.5, 1.0, 0.0, 1.0
]);

const cubeIndices = new Uint16Array([
	0, 1, 2, 2, 3, 0,
	4, 5, 6, 6, 7, 4,
	8, 11, 10, 10, 9, 8,
	12, 13, 14, 14, 15, 12,
	16, 17, 18, 18, 19, 16,
	20, 23, 22, 22, 21, 20
]);

window.onload = function() {
	const canvas = document.getElementById("canvas");
	const gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("WebGL2 is not supported on this device.");
		return;
	}

	const renderer = new Renderer(gl);
	const camera = new Camera(gl, canvas.width, canvas.height);
	const scene = new Scene();
	canvas.tabIndex = 0;

	const input = new Input(canvas);

	const vertexShaderSource = document.getElementById("vertex-shader").textContent.trim();
	const fragmentShaderSource = document.getElementById("fragment-shader").textContent.trim();
	const cubeShader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
	const cubeMaterial = new Material(gl, cubeShader);

	const attribLocations = cubeShader.locations;
	const cubeGeometry = new Geometry(gl, cubeVertices, cubeIndices, attribLocations);

	const rotatingCube = new GameObject(gl, cubeGeometry, cubeMaterial);
	rotatingCube.transform.position.z = -5.0;
	scene.add(rotatingCube);

	const lightCube = new GameObject(gl, cubeGeometry, cubeMaterial);
	lightCube.transform.scale = createVec3(0.2, 0.2, 0.2);
	lightCube.transform.position.x = 2.0;
	lightCube.transform.position.z = -3.0;
	lightCube.transform.recalculateModelMatrix();
	lightCube.isLight = true;
	scene.add(lightCube);

	const offsets = [
		{ x: 3.0, z: 0.0 },
		{ x: -4.0, z: 0.0 },
		{ x: 0.0, z: 4.0 },
		{ x: 0.0, z: -4.0 },
		{ x: 1.0, z: 1.0 },
		{ x: -1.0, z: 1.0 },
		{ x: 1.0, z: -1.0 },
		{ x: -1.0, z: -1.0 },
	];

	for (const off of offsets) {
		const c = new GameObject(gl, cubeGeometry, cubeMaterial);
		c.transform.position.x = lightCube.transform.position.x + off.x;
		c.transform.position.y = 0.0;
		c.transform.position.z = lightCube.transform.position.z + off.z;
		c.transform.scale = createVec3(1.0, 1.0, 1.0);
		c.transform.recalculateModelMatrix();
		scene.add(c);
	}

	let lastTime = 0;

	function gameLoop(currentTime) {
		if (!lastTime) lastTime = currentTime;
		const deltaTime = currentTime - lastTime;
		lastTime = currentTime;

		const dt = deltaTime * 0.001;

		const keys = input.getKeys();
		const moveSpeed = 6.0 * dt;

		let moveForward = 0;
		let moveRight = 0;

		if (keys.get("w")) moveForward += 1;
		if (keys.get("s")) moveForward -= 1;

		if (keys.get("d")) moveRight += 1;
		if (keys.get("a")) moveRight -= 1;

		if (moveForward !== 0 || moveRight !== 0) {
			const forwardX = camera.forward.x;
			const forwardZ = camera.forward.z;

			const rightX = -forwardZ;
			const rightZ = forwardX;

			let dirX = forwardX * moveForward + rightX * moveRight;
			let dirZ = forwardZ * moveForward + rightZ * moveRight;

			const len = Math.hypot(dirX, dirZ);
			if (len > 0) {
				dirX /= len;
				dirZ /= len;

				const deltaX = dirX * moveSpeed;
				const deltaZ = dirZ * moveSpeed;

				const targetX = camera.position.x + deltaX;
				const targetZ = camera.position.z + deltaZ;

				const hit = cameraCollides(targetX, targetZ, camera.position.y, scene);
				if (hit) {
					hit.transform.position.x += deltaX;
					hit.transform.position.z += deltaZ;
					hit.transform.recalculateModelMatrix();
				}

				camera.position.x = targetX;
				camera.position.z = targetZ;
			}
		}

		let { x, y } = input.getChangeInMousePos();
		camera.recalculateViewMatrix(x, y);
		scene.update(deltaTime);

		const lightWorldPos = lightCube.transform.position;
		const lightPosView = multiplyMatrixAndPoint(camera.viewMatrix, lightWorldPos);

		renderer.render(scene, camera, lightPosView);

		requestAnimationFrame(gameLoop);
	}

	requestAnimationFrame(gameLoop);
};
