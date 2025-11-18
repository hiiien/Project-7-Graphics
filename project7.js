// ==============================================================================
// 0. UTILITY MATH FUNCTIONS (Column-Major)
// ==============================================================================

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
		1, 0, 0, 0, // Col 0
		0, 1, 0, 0, // Col 1
		0, 0, 1, 0, // Col 2
		tx, ty, tz, 1 // Col 3 (Translation)
	]);
}

function rotationMatrixY(angle) {
	let cosA = Math.cos(angle);
	let sinA = Math.sin(angle);
	return new Float32Array([
		cosA, 0, -sinA, 0, // Col 0
		0, 1, 0, 0, // Col 1
		sinA, 0, cosA, 0, // Col 2
		0, 0, 0, 1 // Col 3
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

// Column-major lookAt (OpenGL-style)
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

	// Column 0 (Right vector)
	m[0] = s.x; m[1] = s.y; m[2] = s.z; m[3] = 0;
	// Column 1 (Up vector)
	m[4] = u.x; m[5] = u.y; m[6] = u.z; m[7] = 0;
	// Column 2 (Forward vector - negated for RH system)
	m[8] = -f.x; m[9] = -f.y; m[10] = -f.z; m[11] = 0;
	// Column 3 (Translation)
	m[12] = -dot(s, eye);
	m[13] = -dot(u, eye);
	m[14] = dot(f, eye);
	m[15] = 1;

	return m;
}

function cameraCollides(newX, newZ, cameraY, scene) {
	const radius = 0.2; // how "fat" the camera is

	for (const obj of scene.gameObjects) {
		// IMPORTANT: Ignore collision with the light marker
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
			return true;
		}
	}
	return false;
}

class Transform {
	constructor(x = 0, y = 0, z = 0) {
		this.position = createVec3(x, y, z);
		this.rotation = createVec3(0, 0, 0); // Rotation in radians
		this.scale = createVec3(1, 1, 1);
		this.modelMatrix = new Float32Array(16); // Will store combined T*R*S
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

		// Stand back from the cube
		this.position = createVec3(0, 0, 5);

		// Mouse rotation (in radians)
		this.yaw = 0;   // left/right
		this.pitch = 0; // up/down

		this.forward = createVec3(0, 0, -1);

		this.recalculateViewMatrix();
	}

	recalculateViewMatrix() {
		// Compute forward direction from yaw + pitch
		const cosPitch = Math.cos(this.pitch);
		const sinPitch = Math.sin(this.pitch);
		const cosYaw = Math.cos(this.yaw);
		const sinYaw = Math.sin(this.yaw);

		this.forward.x = cosPitch * sinYaw;
		this.forward.y = sinPitch;
		this.forward.z = -cosPitch * cosYaw; // yaw=0, pitch=0 => (0,0,-1)

		const center = {
			x: this.position.x + this.forward.x,
			y: this.position.y + this.forward.y,
			z: this.position.z + this.forward.z,
		};

		const up = { x: 0, y: 1, z: 0 };

		this.viewMatrix = lookAt(this.position, center, up);
	}
}

// ==============================================================================
// 2. WEBGL BUFFER WRAPPERS (VBO, EBO, VAO - Adapted from your original)
// ==============================================================================

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

		// Get uniform/attribute locations once
		this.locations = {
			position: gl.getAttribLocation(this.program, "a_position"),
			color: gl.getAttribLocation(this.program, "a_color"),
			modelViewMatrix: gl.getUniformLocation(this.program, "u_modelViewMatrix"),
			projectionMatrix: gl.getUniformLocation(this.program, "u_projectionMatrix"),
			lightPosView: gl.getUniformLocation(this.program, "u_lightPosView"),
			isLight: gl.getUniformLocation(this.program, "u_isLight"),
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

// ==============================================================================
// 3. CORE ASSET CLASSES (Geometry, Material)
// ==============================================================================

class Input {
	// RESTORED: Full mouse and pointer lock handling
	constructor(canvas) {
		this.canvas = canvas;
		this.keys = new Map();
		this.mouse = new Map();
		this.mouse.set("dx", 0);
		this.mouse.set("dy", 0);
		this.pointerLocked = false;

		// Keyboard listeners
		window.addEventListener("keydown", this.onKeyDown.bind(this));
		window.addEventListener("keyup", this.onKeyUp.bind(this));

		// Pointer lock setup
		this.canvas.addEventListener("click", () => {
			this.canvas.requestPointerLock();
			this.canvas.focus?.();
		});

		document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this));
		document.addEventListener("pointerlockerror", () => {
			console.error("Pointer lock failed");
		});

		// Mouse movement listener (pointer-locked)
		document.addEventListener("mousemove", this.onMouseMove.bind(this));
	}

	getKeys() {
		return this.keys;
	}
	getMouse() {
		return this.mouse;
	}
	isPointerLocked() {
		return this.pointerLocked;
	}

	onPointerLockChange() {
		this.pointerLocked = (document.pointerLockElement === this.canvas);

		if (!this.pointerLocked) {
			this.mouse.set("dx", 0);
			this.mouse.set("dy", 0);
		}
	}

	onKeyDown(event) {
		this.keys.set(event.key.toLowerCase(), true);
	}
	onKeyUp(event) {
		this.keys.set(event.key.toLowerCase(), false);
	}
	// Note: Mouse button listeners (onMouseDown/onMouseUp) were removed for brevity, as they weren't used for movement/rotation.

	onMouseMove(event) {
		if (!this.pointerLocked) return;

		const dx = event.movementX || 0;
		const dy = event.movementY || 0;

		// Accumulate deltas. They are reset to 0 in gameLoop after use.
		this.mouse.set("dx", dx);
		this.mouse.set("dy", dy);
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
		this.ebo.bind(); // EBO is part of the VAO state

		// Vertices are Position (3 floats) + Color (3 floats) = 6 floats
		const stride = 6 * Float32Array.BYTES_PER_ELEMENT; // 24 bytes
		const colorOffset = 3 * Float32Array.BYTES_PER_ELEMENT; // 12 bytes

		// Link Position (a_position)
		this.vao.linkAttrib(this.vbo, attribLocations.position, 3, gl.FLOAT, stride, 0);
		// Link Color (a_color)
		this.vao.linkAttrib(this.vbo, attribLocations.color, 3, gl.FLOAT, stride, colorOffset);

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

	// Called once per frame, before drawing the object
	setUniforms(modelMatrix, viewMatrix, projectionMatrix) {
		const gl = this.gl;

		// Combine Model and View matrices here to create the u_modelViewMatrix
		const modelViewMatrix = multiplyMatrices(viewMatrix, modelMatrix);

		gl.uniformMatrix4fv(this.shader.locations.modelViewMatrix, false, modelViewMatrix);
		gl.uniformMatrix4fv(this.shader.locations.projectionMatrix, false, projectionMatrix);

		// Future: set texture uniforms, lighting uniforms, etc.
	}
}

// ==============================================================================
// 4. ENTITY CLASSES (GameObject)
// ==============================================================================

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

		// Is this object the light marker?
		const isLight = this.isLight ? 1 : 0;
		const isLightLoc = this.material.shader.locations.isLight;
		if (isLightLoc) {
			gl.uniform1i(isLightLoc, isLight);
		}

		// Set light position in VIEW space for shading
		const lpLoc = this.material.shader.locations.lightPosView;
		if (lpLoc) {
			gl.uniform3f(lpLoc, lightPosView.x, lightPosView.y, lightPosView.z);
		}

		this.geometry.vao.bind();
		this.geometry.draw();
		this.geometry.vao.unbind();
	}
}

// ==============================================================================
// 5. ENGINE/SCENE CLASSES (Scene, Renderer)
// ==============================================================================

class Scene {
	constructor() {
		this.gameObjects = [];
		// this.lights = []; // Future: for light sources
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

// ==============================================================================
// 6. CUBE DATA
// ==============================================================================

// Cube Vertex Data (Position + Color)
const cubeVertices = new Float32Array([
	// Front face (Red)
	-0.5, -0.5, 0.5, 1.0, 0.0, 0.0, // 0
	0.5, -0.5, 0.5, 1.0, 0.0, 0.0, // 1
	0.5, 0.5, 0.5, 1.0, 0.0, 0.0, // 2
	-0.5, 0.5, 0.5, 1.0, 0.0, 0.0, // 3

	// Back face (Green)
	-0.5, -0.5, -0.5, 0.0, 1.0, 0.0, // 4
	-0.5, 0.5, -0.5, 0.0, 1.0, 0.0, // 5
	0.5, 0.5, -0.5, 0.0, 1.0, 0.0, // 6
	0.5, -0.5, -0.5, 0.0, 1.0, 0.0, // 7

	// Top face (Blue)
	-0.5, 0.5, 0.5, 0.0, 0.0, 1.0, // 8
	0.5, 0.5, 0.5, 0.0, 0.0, 1.0, // 9
	0.5, 0.5, -0.5, 0.0, 0.0, 1.0, // 10
	-0.5, 0.5, -0.5, 0.0, 0.0, 1.0, // 11

	// Bottom face (Yellow)
	-0.5, -0.5, 0.5, 1.0, 1.0, 0.0, // 12
	0.5, -0.5, 0.5, 1.0, 1.0, 0.0, // 13
	0.5, -0.5, -0.5, 1.0, 1.0, 0.0, // 14
	-0.5, -0.5, -0.5, 1.0, 1.0, 0.0, // 15

	// Right face (Cyan)
	0.5, -0.5, 0.5, 0.0, 1.0, 1.0, // 16
	0.5, 0.5, 0.5, 0.0, 1.0, 1.0, // 17
	0.5, 0.5, -0.5, 0.0, 1.0, 1.0, // 18
	0.5, -0.5, -0.5, 0.0, 1.0, 1.0, // 19

	// Left face (Magenta)
	-0.5, -0.5, 0.5, 1.0, 0.0, 1.0, // 20
	-0.5, -0.5, -0.5, 1.0, 0.0, 1.0, // 21
	-0.5, 0.5, -0.5, 1.0, 0.0, 1.0, // 22
	-0.5, 0.5, 0.5, 1.0, 0.0, 1.0  // 23
]);

// Cube Index Data (Corrected CCW winding)
const cubeIndices = new Uint16Array([
	// Front face
	0, 1, 2, 2, 3, 0,

	// Back face
	4, 5, 6, 6, 7, 4,

	// Top face 
	8, 11, 10, 10, 9, 8,

	// Bottom face
	12, 13, 14, 14, 15, 12,

	// Right face 
	16, 17, 18, 18, 19, 16,

	// Left face 
	20, 23, 22, 22, 21, 20
]);

// ==============================================================================
// 7. MAIN INITIALIZATION AND GAME LOOP
// ==============================================================================

window.onload = function() {
	/** @type {HTMLCanvasElement} */
	const canvas = document.getElementById("canvas");
	/** @type {WebGL2RenderingContext} */
	const gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("WebGL2 is not supported on this device.");
		return;
	}

	// 1. Initialization
	const renderer = new Renderer(gl);
	const camera = new Camera(gl, canvas.width, canvas.height);
	const scene = new Scene();
	canvas.tabIndex = 0;

	const input = new Input(canvas);
	// 2. Setup Assets (Shader and Material)
	const vertexShaderSource = document.getElementById("vertex-shader").textContent.trim();
	const fragmentShaderSource = document.getElementById("fragment-shader").textContent.trim();
	const cubeShader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
	const cubeMaterial = new Material(gl, cubeShader);

	// 3. Setup Geometry (Pass Shader Locations for VAO linking)
	const attribLocations = cubeShader.locations;
	const cubeGeometry = new Geometry(gl, cubeVertices, cubeIndices, attribLocations);

	// 4. Create Game Object and position it
	const rotatingCube = new GameObject(gl, cubeGeometry, cubeMaterial);
	rotatingCube.transform.position.z = -5.0; // Move cube back 5 units
	scene.add(rotatingCube);

	const lightCube = new GameObject(gl, cubeGeometry, cubeMaterial);
	lightCube.transform.scale = createVec3(0.2, 0.2, 0.2);
	lightCube.transform.position.x = 2.0;
	lightCube.transform.position.z = -3.0;
	lightCube.transform.recalculateModelMatrix();
	lightCube.isLight = true;
	scene.add(lightCube);

	// ---- Surround the light with more cubes ----
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

	// 5. Game Loop
	let lastTime = 0;

	function gameLoop(currentTime) {
		// Time step
		if (!lastTime) lastTime = currentTime;
		const deltaTime = currentTime - lastTime;
		lastTime = currentTime;

		const keys = input.getKeys();
		const mouse = input.getMouse();

		// ==============================================
		// 1) CAMERA ROTATION (MOUSE LOOK - PIVOT IN PLACE)
		// ==============================================
		if (input.isPointerLocked()) {
			const sensitivity = 0.003;

			const dx = mouse.get("dx") || 0;
			const dy = mouse.get("dy") || 0;

			// Mouse ONLY changes yaw/pitch
			camera.yaw += dx * sensitivity;  // Horizontal mouse movement
			camera.pitch -= dy * sensitivity;  // Vertical mouse movement

			// Clamp pitch
			const maxPitch = Math.PI / 2 - 0.01;
			if (camera.pitch > maxPitch) camera.pitch = maxPitch;
			if (camera.pitch < -maxPitch) camera.pitch = -maxPitch;

			// Clear the mouse deltas
			mouse.set("dx", 0);
			mouse.set("dy", 0);
		}

		// ==============================================
		// 2) CAMERA TRANSLATION (WASD - FORWARD/STRAFE)
		// ==============================================
		const moveSpeed = 0.02;

		let moveForward = 0; // W/S
		let moveRight = 0;   // D/A (Strafe Right/Left)

		if (keys.get("w")) moveForward += 1;
		if (keys.get("s")) moveForward -= 1;

		if (keys.get("d")) moveRight += 1; // Strafe Right
		if (keys.get("a")) moveRight -= 1; // Strafe Left


		if (moveForward !== 0 || moveRight !== 0) {
			// Calculate direction vectors based on camera's current yaw
			const yaw = camera.yaw;
			const cosYaw = Math.cos(yaw);
			const sinYaw = Math.sin(yaw);

			// Forward vector (on XZ plane)
			const forwardX = sinYaw;
			const forwardZ = -cosYaw;

			// Right (Strafe) vector
			const rightX = cosYaw;
			const rightZ = sinYaw;

			// Combine forward/right inputs to get the final world-space direction vector
			let dirX = forwardX * moveForward + rightX * moveRight;
			let dirZ = forwardZ * moveForward + rightZ * moveRight;

			// Normalize so diagonal isn't faster
			const len = Math.hypot(dirX, dirZ);
			if (len > 0) {
				dirX /= len;
				dirZ /= len;

				const deltaX = dirX * moveSpeed;
				const deltaZ = dirZ * moveSpeed;

				// Apply X movement with collision check
				const tryX = camera.position.x + deltaX;
				if (!cameraCollides(tryX, camera.position.z, camera.position.y, scene)) {
					camera.position.x = tryX;
				}

				// Apply Z movement with collision check
				const tryZ = camera.position.z + deltaZ;
				if (!cameraCollides(camera.position.x, tryZ, camera.position.y, scene)) {
					camera.position.z = tryZ;
				}
			}
		}

		// ===== 3) UPDATE VIEW MATRIX AND DRAW =====
		// This must run after all position/rotation updates
		camera.recalculateViewMatrix();
		scene.update(deltaTime);

		// Use the lightCube as the point light
		const lightWorldPos = lightCube.transform.position;
		const lightPosView = multiplyMatrixAndPoint(camera.viewMatrix, lightWorldPos);

		renderer.render(scene, camera, lightPosView);

		requestAnimationFrame(gameLoop);
	}

	requestAnimationFrame(gameLoop);
}
