window.onload = function() {
	/** @type {HTMLCanvasElement} */
	var canvas = document.getElementById("canvas");
	/** @type {WebGL2RenderingContext} */
	var gl = canvas.getContext("webgl2");
	if (!gl) {
		alert("WebGL is not supported on this device.");
		return;
	}
	gl.clearColor(0.0, 0.0, 0.0, 1.0);

	var shader = new Shader(
		gl,
		document.getElementById("vertex-shader").textContent.trim(),
		document.getElementById("fragment-shader").textContent.trim()
	);

	var vbo = new VertexBufferObject(gl, new Float32Array([
		-0.5, -0.5,
		0.5, -0.5,
		0.5, 0.5,
		-0.5, 0.5
	]));

	var ebo = new ElementBufferObject(gl, new Uint16Array([
		0, 1, 2,
		2, 3, 0
	]));

	var vao = new VAO(gl);
	vao.bind();

	// IMPORTANT: EBO MUST BE BOUND WHILE VAO IS BOUND
	ebo.bind();
	const positionAttribLocation = gl.getAttribLocation(shader.program, "a_position");
	// Link position attribute
	vao.linkAttrib(vbo, positionAttribLocation, 2, gl.FLOAT, 0, 0);

	vao.unbind(); // VAO now stores VBO+EBO state

	//---------------------------------------
	// Rendering
	//---------------------------------------
	gl.clear(gl.COLOR_BUFFER_BIT);
	shader.activate();

	vao.bind(); // <-- REQUIRED
	gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
	// Check for WebGL errors
	var error = gl.getError();
	if (error !== gl.NO_ERROR) {
		console.error("WebGL Error: " + error);
	}

	// Log that rendering completed
	console.log("Rendering completed");
	// No unbinding needed after drawing
}

class Shader {
	/** 
	 * @param {WebGL2RenderingContext} gl 
	 * @param {string} vs 
	 * @param {string} fs 
	 */
	constructor(gl, vs, fs) {
		this.gl = gl;
		this.program = gl.createProgram();
		this.vs = gl.createShader(gl.VERTEX_SHADER);
		this.fs = gl.createShader(gl.FRAGMENT_SHADER);

		gl.shaderSource(this.vs, vs);
		gl.shaderSource(this.fs, fs);

		gl.compileShader(this.vs);
		gl.compileShader(this.fs);

		gl.attachShader(this.program, this.vs);
		gl.attachShader(this.program, this.fs);

		gl.linkProgram(this.program);
		gl.useProgram(this.program);
	}
	/**
	 * @param {WebGL2RenderingContext} gl 
	 */
	activate() {
		this.gl.useProgram(this.program);
	}
	/**
	 * @param {WebGL2RenderingContext} gl 
	 */
	deactivate() {
		this.gl.deleteProgram(this.program)
	}

}

class VertexBufferObject {
	/** 
	 * @param {WebGL2RenderingContext} gl 
	 * @param {Float32Array} data 
	 */
	constructor(gl, data) {
		this.gl = gl;
		this.buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
	}
	bind() {
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
	}
	unbind() {
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
	}
	delete() {
		this.gl.deleteBuffer(this.buffer);
	}
}

class ElementBufferObject {
	/** 
	 * @param {WebGL2RenderingContext} gl 
	 * @param {Uint16Array} data 
	 */
	constructor(gl, data) {
		this.gl = gl;
		this.buffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), gl.STATIC_DRAW);
	}
	bind() {
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffer);
	}
	unbind() {
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
	}
	delete() {
		this.gl.deleteBuffer(this.buffer);
	}
}

class VAO {
	constructor(gl) {
		this.gl = gl;
		this.vao = gl.createVertexArray();
	}

	bind() {
		this.gl.bindVertexArray(this.vao);
	}

	unbind() {
		this.gl.bindVertexArray(null);
	}

	delete() {
		this.gl.deleteVertexArray(this.vao);
	}

	linkAttrib(vbo, layout, size, type, stride, offset) {
		const gl = this.gl;

		vbo.bind(gl);

		gl.vertexAttribPointer(
			layout,
			size,
			type,
			false,     // normalized
			stride,
			offset
		);

		gl.enableVertexAttribArray(layout);

		vbo.unbind(gl);
	}
}
