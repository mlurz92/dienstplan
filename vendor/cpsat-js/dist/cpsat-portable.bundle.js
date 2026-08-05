var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// vendor/cpsat-js/build/portable/cpsat.mjs
var cpsat_exports = {};
__export(cpsat_exports, {
  default: () => cpsat_default
});
async function createCpSatModule(moduleArg = {}) {
  var moduleRtn;
  var Module = moduleArg;
  var ENVIRONMENT_IS_WEB = !!globalThis.window;
  var ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;
  var ENVIRONMENT_IS_NODE = globalThis.process?.versions?.node && globalThis.process?.type != "renderer";
  if (ENVIRONMENT_IS_NODE) {
    const { createRequire } = await import("node:module");
    var require2 = createRequire(import.meta.url);
  }
  var arguments_ = [];
  var thisProgram = "./this.program";
  var quit_ = (status, toThrow) => {
    throw toThrow;
  };
  var _scriptName = import.meta.url;
  var scriptDirectory = "";
  function locateFile(path) {
    if (Module["locateFile"]) {
      return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
  }
  var readAsync, readBinary;
  if (ENVIRONMENT_IS_NODE) {
    var fs = require2("node:fs");
    if (_scriptName.startsWith("file:")) {
      scriptDirectory = require2("node:path").dirname(require2("node:url").fileURLToPath(_scriptName)) + "/";
    }
    readBinary = (filename) => {
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename);
      return ret;
    };
    readAsync = async (filename, binary = true) => {
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename, binary ? void 0 : "utf8");
      return ret;
    };
    if (process.argv.length > 1) {
      thisProgram = process.argv[1].replace(/\\/g, "/");
    }
    arguments_ = process.argv.slice(2);
    quit_ = (status, toThrow) => {
      process.exitCode = status;
      throw toThrow;
    };
  } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href;
    } catch {
    }
    {
      readAsync = async (url) => {
        var response = await fetch(url, { credentials: "same-origin" });
        if (response.ok) {
          return response.arrayBuffer();
        }
        throw new Error(response.status + " : " + response.url);
      };
    }
  } else {
  }
  var out = console.log.bind(console);
  var err = console.error.bind(console);
  var wasmBinary;
  var ABORT = false;
  var EXITSTATUS;
  var isFileURI = (filename) => filename.startsWith("file://");
  class EmscriptenEH {
  }
  class EmscriptenSjLj extends EmscriptenEH {
  }
  var readyPromiseResolve, readyPromiseReject;
  var runtimeInitialized = false;
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    HEAP8 = new Int8Array(b);
    HEAP16 = new Int16Array(b);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
    HEAPU16 = new Uint16Array(b);
    HEAP32 = new Int32Array(b);
    HEAPU32 = new Uint32Array(b);
    HEAPF32 = new Float32Array(b);
    HEAPF64 = new Float64Array(b);
    HEAP64 = new BigInt64Array(b);
    HEAPU64 = new BigUint64Array(b);
  }
  function preRun() {
    if (Module["preRun"]) {
      if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
      while (Module["preRun"].length) {
        addOnPreRun(Module["preRun"].shift());
      }
    }
    callRuntimeCallbacks(onPreRuns);
  }
  function initRuntime() {
    runtimeInitialized = true;
    if (!Module["noFSInit"] && !FS.initialized) FS.init();
    TTY.init();
    wasmExports["F"]();
    FS.ignorePermissions = false;
  }
  function postRun() {
    if (Module["postRun"]) {
      if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
      while (Module["postRun"].length) {
        addOnPostRun(Module["postRun"].shift());
      }
    }
    callRuntimeCallbacks(onPostRuns);
  }
  function abort(what) {
    Module["onAbort"]?.(what);
    what = `Aborted(${what})`;
    err(what);
    ABORT = true;
    what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    readyPromiseReject?.(e);
    throw e;
  }
  var wasmBinaryFile;
  function findWasmBinary() {
    if (Module["locateFile"]) {
      return locateFile("cpsat.wasm");
    }
    return new URL("cpsat.wasm", import.meta.url).href;
  }
  function getBinarySync(file) {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    }
    throw "both async and sync fetching of the wasm failed";
  }
  async function getWasmBinary(binaryFile) {
    if (!wasmBinary) {
      try {
        var response = await readAsync(binaryFile);
        return new Uint8Array(response);
      } catch {
      }
    }
    return getBinarySync(binaryFile);
  }
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary = await getWasmBinary(binaryFile);
      var instance = await WebAssembly.instantiate(binary, imports);
      return instance;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`);
      abort(reason);
    }
  }
  async function instantiateAsync(binary, binaryFile, imports) {
    if (!binary && !ENVIRONMENT_IS_NODE) {
      try {
        var response = fetch(binaryFile, { credentials: "same-origin" });
        var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
        return instantiationResult;
      } catch (reason) {
        err(`wasm streaming compile failed: ${reason}`);
        err("falling back to ArrayBuffer instantiation");
      }
    }
    return instantiateArrayBuffer(binaryFile, imports);
  }
  function getWasmImports() {
    var imports = { a: wasmImports };
    return imports;
  }
  async function createWasm() {
    function receiveInstance(instance, module) {
      wasmExports = instance.exports;
      assignWasmExports(wasmExports);
      updateMemoryViews();
      return wasmExports;
    }
    function receiveInstantiationResult(result2) {
      return receiveInstance(result2["instance"]);
    }
    var info = getWasmImports();
    if (Module["instantiateWasm"]) {
      return new Promise((resolve, reject) => {
        Module["instantiateWasm"](info, (inst, mod) => {
          resolve(receiveInstance(inst, mod));
        });
      });
    }
    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
    var exports = receiveInstantiationResult(result);
    return exports;
  }
  class ExitStatus {
    name = "ExitStatus";
    constructor(status) {
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
  }
  var HEAP16;
  var HEAP32;
  var HEAP64;
  var HEAP8;
  var HEAPF32;
  var HEAPF64;
  var HEAPU16;
  var HEAPU32;
  var HEAPU64;
  var HEAPU8;
  var callRuntimeCallbacks = (callbacks) => {
    while (callbacks.length > 0) {
      callbacks.shift()(Module);
    }
  };
  var onPostRuns = [];
  var addOnPostRun = (cb) => onPostRuns.push(cb);
  var onPreRuns = [];
  var addOnPreRun = (cb) => onPreRuns.push(cb);
  var noExitRuntime = true;
  var stackRestore = (val) => __emscripten_stack_restore(val);
  var stackSave = () => _emscripten_stack_get_current();
  var wasmTableMirror = [];
  var getWasmTableEntry = (funcPtr) => {
    var func = wasmTableMirror[funcPtr];
    if (!func) {
      wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
    }
    return func;
  };
  var ___call_sighandler = (fp, sig) => getWasmTableEntry(fp)(sig);
  class ExceptionInfo {
    constructor(excPtr) {
      this.excPtr = excPtr;
      this.ptr = excPtr - 24;
    }
    set_type(type) {
      HEAPU32[this.ptr + 4 >> 2] = type;
    }
    get_type() {
      return HEAPU32[this.ptr + 4 >> 2];
    }
    set_destructor(destructor) {
      HEAPU32[this.ptr + 8 >> 2] = destructor;
    }
    get_destructor() {
      return HEAPU32[this.ptr + 8 >> 2];
    }
    set_caught(caught) {
      caught = caught ? 1 : 0;
      HEAP8[this.ptr + 12] = caught;
    }
    get_caught() {
      return HEAP8[this.ptr + 12] != 0;
    }
    set_rethrown(rethrown) {
      rethrown = rethrown ? 1 : 0;
      HEAP8[this.ptr + 13] = rethrown;
    }
    get_rethrown() {
      return HEAP8[this.ptr + 13] != 0;
    }
    init(type, destructor) {
      this.set_adjusted_ptr(0);
      this.set_type(type);
      this.set_destructor(destructor);
    }
    set_adjusted_ptr(adjustedPtr) {
      HEAPU32[this.ptr + 16 >> 2] = adjustedPtr;
    }
    get_adjusted_ptr() {
      return HEAPU32[this.ptr + 16 >> 2];
    }
  }
  var uncaughtExceptionCount = 0;
  var ___cxa_throw = (ptr, type, destructor) => {
    var info = new ExceptionInfo(ptr);
    info.init(type, destructor);
    uncaughtExceptionCount++;
    abort();
  };
  var syscallGetVarargI = () => {
    var ret = HEAP32[+SYSCALLS.varargs >> 2];
    SYSCALLS.varargs += 4;
    return ret;
  };
  var syscallGetVarargP = syscallGetVarargI;
  var PATH = { isAbs: (path) => path.charAt(0) === "/", splitPath: (filename) => {
    var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    return splitPathRe.exec(filename).slice(1);
  }, normalizeArray: (parts, allowAboveRoot) => {
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === ".") {
        parts.splice(i, 1);
      } else if (last === "..") {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }
    if (allowAboveRoot) {
      for (; up; up--) {
        parts.unshift("..");
      }
    }
    return parts;
  }, normalize: (path) => {
    var isAbsolute = PATH.isAbs(path), trailingSlash = path.slice(-1) === "/";
    path = PATH.normalizeArray(path.split("/").filter((p) => !!p), !isAbsolute).join("/");
    if (!path && !isAbsolute) {
      path = ".";
    }
    if (path && trailingSlash) {
      path += "/";
    }
    return (isAbsolute ? "/" : "") + path;
  }, dirname: (path) => {
    var result = PATH.splitPath(path), root = result[0], dir = result[1];
    if (!root && !dir) {
      return ".";
    }
    if (dir) {
      dir = dir.slice(0, -1);
    }
    return root + dir;
  }, basename: (path) => path && path.match(/([^\/]+|\/)\/*$/)[1], join: (...paths) => PATH.normalize(paths.join("/")), join2: (l, r) => PATH.normalize(l + "/" + r) };
  var initRandomFill = () => {
    if (ENVIRONMENT_IS_NODE) {
      var nodeCrypto = require2("node:crypto");
      return (view) => nodeCrypto.randomFillSync(view);
    }
    return (view) => (crypto.getRandomValues(view), 0);
  };
  var randomFill = (view) => (randomFill = initRandomFill())(view);
  var PATH_FS = { resolve: (...args) => {
    var resolvedPath = "", resolvedAbsolute = false;
    for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = i >= 0 ? args[i] : FS.cwd();
      if (typeof path != "string") {
        throw new TypeError("Arguments to path.resolve must be strings");
      } else if (!path) {
        return "";
      }
      resolvedPath = path + "/" + resolvedPath;
      resolvedAbsolute = PATH.isAbs(path);
    }
    resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter((p) => !!p), !resolvedAbsolute).join("/");
    return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
  }, relative: (from, to) => {
    from = PATH_FS.resolve(from).slice(1);
    to = PATH_FS.resolve(to).slice(1);
    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== "") break;
      }
      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== "") break;
      }
      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }
    var fromParts = trim(from.split("/"));
    var toParts = trim(to.split("/"));
    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }
    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push("..");
    }
    outputParts = outputParts.concat(toParts.slice(samePartsLength));
    return outputParts.join("/");
  } };
  var UTF8Decoder = globalThis.TextDecoder && new TextDecoder();
  var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx;
  };
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    var str = "";
    while (idx < endPtr) {
      var u0 = heapOrArray[idx++];
      if (!(u0 & 128)) {
        str += String.fromCharCode(u0);
        continue;
      }
      var u1 = heapOrArray[idx++] & 63;
      if ((u0 & 224) == 192) {
        str += String.fromCharCode((u0 & 31) << 6 | u1);
        continue;
      }
      var u2 = heapOrArray[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = (u0 & 15) << 12 | u1 << 6 | u2;
      } else {
        u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
      }
      if (u0 < 65536) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
      }
    }
    return str;
  };
  var FS_stdin_getChar_buffer = [];
  var lengthBytesUTF8 = (str) => {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
      var c = str.charCodeAt(i);
      if (c <= 127) {
        len++;
      } else if (c <= 2047) {
        len += 2;
      } else if (c >= 55296 && c <= 57343) {
        len += 4;
        ++i;
      } else {
        len += 3;
      }
    }
    return len;
  };
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
      var u = str.codePointAt(i);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 192 | u >> 6;
        heap[outIdx++] = 128 | u & 63;
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 224 | u >> 12;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
      } else {
        if (outIdx + 3 >= endIdx) break;
        heap[outIdx++] = 240 | u >> 18;
        heap[outIdx++] = 128 | u >> 12 & 63;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
        i++;
      }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx;
  };
  var intArrayFromString = (stringy, dontAddNull, length) => {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
  };
  var FS_stdin_getChar = () => {
    if (!FS_stdin_getChar_buffer.length) {
      var result = null;
      if (ENVIRONMENT_IS_NODE) {
        var BUFSIZE = 256;
        var buf = Buffer.alloc(BUFSIZE);
        var bytesRead = 0;
        var fd = process.stdin.fd;
        try {
          bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
        } catch (e) {
          if (e.toString().includes("EOF")) bytesRead = 0;
          else throw e;
        }
        if (bytesRead > 0) {
          result = buf.slice(0, bytesRead).toString("utf-8");
        }
      } else if (globalThis.window?.prompt) {
        result = window.prompt("Input: ");
        if (result !== null) {
          result += "\n";
        }
      } else {
      }
      if (!result) {
        return null;
      }
      FS_stdin_getChar_buffer = intArrayFromString(result, true);
    }
    return FS_stdin_getChar_buffer.shift();
  };
  var TTY = { ttys: [], init() {
  }, shutdown() {
  }, register(dev, ops) {
    TTY.ttys[dev] = { input: [], output: [], ops };
    FS.registerDevice(dev, TTY.stream_ops);
  }, stream_ops: { open(stream) {
    var tty = TTY.ttys[stream.node.rdev];
    if (!tty) {
      throw new FS.ErrnoError(43);
    }
    stream.tty = tty;
    stream.seekable = false;
  }, close(stream) {
    stream.tty.ops.fsync(stream.tty);
  }, fsync(stream) {
    stream.tty.ops.fsync(stream.tty);
  }, read(stream, buffer, offset, length, pos) {
    if (!stream.tty || !stream.tty.ops.get_char) {
      throw new FS.ErrnoError(60);
    }
    var bytesRead = 0;
    for (var i = 0; i < length; i++) {
      var result;
      try {
        result = stream.tty.ops.get_char(stream.tty);
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
      if (result === void 0 && bytesRead === 0) {
        throw new FS.ErrnoError(6);
      }
      if (result === null || result === void 0) break;
      bytesRead++;
      buffer[offset + i] = result;
    }
    if (bytesRead) {
      stream.node.atime = Date.now();
    }
    return bytesRead;
  }, write(stream, buffer, offset, length, pos) {
    if (!stream.tty || !stream.tty.ops.put_char) {
      throw new FS.ErrnoError(60);
    }
    try {
      for (var i = 0; i < length; i++) {
        stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
      }
    } catch (e) {
      throw new FS.ErrnoError(29);
    }
    if (length) {
      stream.node.mtime = stream.node.ctime = Date.now();
    }
    return i;
  } }, default_tty_ops: { get_char(tty) {
    return FS_stdin_getChar();
  }, put_char(tty, val) {
    if (val === null || val === 10) {
      out(UTF8ArrayToString(tty.output));
      tty.output = [];
    } else {
      if (val != 0) tty.output.push(val);
    }
  }, fsync(tty) {
    if (tty.output?.length > 0) {
      out(UTF8ArrayToString(tty.output));
      tty.output = [];
    }
  }, ioctl_tcgets(tty) {
    return { c_iflag: 25856, c_oflag: 5, c_cflag: 191, c_lflag: 35387, c_cc: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  }, ioctl_tcsets(tty, optional_actions, data) {
    return 0;
  }, ioctl_tiocgwinsz(tty) {
    return [24, 80];
  } }, default_tty1_ops: { put_char(tty, val) {
    if (val === null || val === 10) {
      err(UTF8ArrayToString(tty.output));
      tty.output = [];
    } else {
      if (val != 0) tty.output.push(val);
    }
  }, fsync(tty) {
    if (tty.output?.length > 0) {
      err(UTF8ArrayToString(tty.output));
      tty.output = [];
    }
  } } };
  var zeroMemory = (ptr, size) => HEAPU8.fill(0, ptr, ptr + size);
  var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
  var mmapAlloc = (size) => {
    size = alignMemory(size, 65536);
    var ptr = _emscripten_builtin_memalign(65536, size);
    if (ptr) zeroMemory(ptr, size);
    return ptr;
  };
  var MEMFS = { ops_table: null, mount(mount) {
    return MEMFS.createNode(null, "/", 16895, 0);
  }, createNode(parent, name, mode, dev) {
    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
      throw new FS.ErrnoError(63);
    }
    MEMFS.ops_table ||= { dir: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, lookup: MEMFS.node_ops.lookup, mknod: MEMFS.node_ops.mknod, rename: MEMFS.node_ops.rename, unlink: MEMFS.node_ops.unlink, rmdir: MEMFS.node_ops.rmdir, readdir: MEMFS.node_ops.readdir, symlink: MEMFS.node_ops.symlink }, stream: { llseek: MEMFS.stream_ops.llseek } }, file: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: { llseek: MEMFS.stream_ops.llseek, read: MEMFS.stream_ops.read, write: MEMFS.stream_ops.write, mmap: MEMFS.stream_ops.mmap, msync: MEMFS.stream_ops.msync } }, link: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr, readlink: MEMFS.node_ops.readlink }, stream: {} }, chrdev: { node: { getattr: MEMFS.node_ops.getattr, setattr: MEMFS.node_ops.setattr }, stream: FS.chrdev_stream_ops } };
    var node = FS.createNode(parent, name, mode, dev);
    if (FS.isDir(node.mode)) {
      node.node_ops = MEMFS.ops_table.dir.node;
      node.stream_ops = MEMFS.ops_table.dir.stream;
      node.contents = {};
    } else if (FS.isFile(node.mode)) {
      node.node_ops = MEMFS.ops_table.file.node;
      node.stream_ops = MEMFS.ops_table.file.stream;
      node.usedBytes = 0;
      node.contents = MEMFS.emptyFileContents ??= new Uint8Array(0);
    } else if (FS.isLink(node.mode)) {
      node.node_ops = MEMFS.ops_table.link.node;
      node.stream_ops = MEMFS.ops_table.link.stream;
    } else if (FS.isChrdev(node.mode)) {
      node.node_ops = MEMFS.ops_table.chrdev.node;
      node.stream_ops = MEMFS.ops_table.chrdev.stream;
    }
    node.atime = node.mtime = node.ctime = Date.now();
    if (parent) {
      parent.contents[name] = node;
      parent.atime = parent.mtime = parent.ctime = node.atime;
    }
    return node;
  }, getFileDataAsTypedArray(node) {
    return node.contents.subarray(0, node.usedBytes);
  }, expandFileStorage(node, newCapacity) {
    var prevCapacity = node.contents.length;
    if (prevCapacity >= newCapacity) return;
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
    if (prevCapacity) newCapacity = Math.max(newCapacity, 256);
    var oldContents = MEMFS.getFileDataAsTypedArray(node);
    node.contents = new Uint8Array(newCapacity);
    node.contents.set(oldContents);
  }, resizeFileStorage(node, newSize) {
    if (node.usedBytes == newSize) return;
    var oldContents = node.contents;
    node.contents = new Uint8Array(newSize);
    node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
    node.usedBytes = newSize;
  }, node_ops: { getattr(node) {
    var attr = {};
    attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
    attr.ino = node.id;
    attr.mode = node.mode;
    attr.nlink = 1;
    attr.uid = 0;
    attr.gid = 0;
    attr.rdev = node.rdev;
    if (FS.isDir(node.mode)) {
      attr.size = 4096;
    } else if (FS.isFile(node.mode)) {
      attr.size = node.usedBytes;
    } else if (FS.isLink(node.mode)) {
      attr.size = node.link.length;
    } else {
      attr.size = 0;
    }
    attr.atime = new Date(node.atime);
    attr.mtime = new Date(node.mtime);
    attr.ctime = new Date(node.ctime);
    attr.blksize = 4096;
    attr.blocks = Math.ceil(attr.size / attr.blksize);
    return attr;
  }, setattr(node, attr) {
    for (const key of ["mode", "atime", "mtime", "ctime"]) {
      if (attr[key] != null) {
        node[key] = attr[key];
      }
    }
    if (attr.size !== void 0) {
      MEMFS.resizeFileStorage(node, attr.size);
    }
  }, lookup(parent, name) {
    if (!MEMFS.doesNotExistError) {
      MEMFS.doesNotExistError = new FS.ErrnoError(44);
      MEMFS.doesNotExistError.stack = "<generic error, no stack>";
    }
    throw MEMFS.doesNotExistError;
  }, mknod(parent, name, mode, dev) {
    return MEMFS.createNode(parent, name, mode, dev);
  }, rename(old_node, new_dir, new_name) {
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {
    }
    if (new_node) {
      if (FS.isDir(old_node.mode)) {
        for (var i in new_node.contents) {
          throw new FS.ErrnoError(55);
        }
      }
      FS.hashRemoveNode(new_node);
    }
    delete old_node.parent.contents[old_node.name];
    new_dir.contents[new_name] = old_node;
    old_node.name = new_name;
    new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now();
  }, unlink(parent, name) {
    delete parent.contents[name];
    parent.ctime = parent.mtime = Date.now();
  }, rmdir(parent, name) {
    var node = FS.lookupNode(parent, name);
    for (var i in node.contents) {
      throw new FS.ErrnoError(55);
    }
    delete parent.contents[name];
    parent.ctime = parent.mtime = Date.now();
  }, readdir(node) {
    return [".", "..", ...Object.keys(node.contents)];
  }, symlink(parent, newname, oldpath) {
    var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
    node.link = oldpath;
    return node;
  }, readlink(node) {
    if (!FS.isLink(node.mode)) {
      throw new FS.ErrnoError(28);
    }
    return node.link;
  } }, stream_ops: { read(stream, buffer, offset, length, position) {
    var contents = stream.node.contents;
    if (position >= stream.node.usedBytes) return 0;
    var size = Math.min(stream.node.usedBytes - position, length);
    buffer.set(contents.subarray(position, position + size), offset);
    return size;
  }, write(stream, buffer, offset, length, position, canOwn) {
    if (buffer.buffer === HEAP8.buffer) {
      canOwn = false;
    }
    if (!length) return 0;
    var node = stream.node;
    node.mtime = node.ctime = Date.now();
    if (canOwn) {
      node.contents = buffer.subarray(offset, offset + length);
      node.usedBytes = length;
    } else if (node.usedBytes === 0 && position === 0) {
      node.contents = buffer.slice(offset, offset + length);
      node.usedBytes = length;
    } else {
      MEMFS.expandFileStorage(node, position + length);
      node.contents.set(buffer.subarray(offset, offset + length), position);
      node.usedBytes = Math.max(node.usedBytes, position + length);
    }
    return length;
  }, llseek(stream, offset, whence) {
    var position = offset;
    if (whence === 1) {
      position += stream.position;
    } else if (whence === 2) {
      if (FS.isFile(stream.node.mode)) {
        position += stream.node.usedBytes;
      }
    }
    if (position < 0) {
      throw new FS.ErrnoError(28);
    }
    return position;
  }, mmap(stream, length, position, prot, flags) {
    if (!FS.isFile(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    var ptr;
    var allocated;
    var contents = stream.node.contents;
    if (!(flags & 2) && contents.buffer === HEAP8.buffer) {
      allocated = false;
      ptr = contents.byteOffset;
    } else {
      allocated = true;
      ptr = mmapAlloc(length);
      if (!ptr) {
        throw new FS.ErrnoError(48);
      }
      if (contents) {
        if (position > 0 || position + length < contents.length) {
          if (contents.subarray) {
            contents = contents.subarray(position, position + length);
          } else {
            contents = Array.prototype.slice.call(contents, position, position + length);
          }
        }
        HEAP8.set(contents, ptr);
      }
    }
    return { ptr, allocated };
  }, msync(stream, buffer, offset, length, mmapFlags) {
    MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
    return 0;
  } } };
  var FS_modeStringToFlags = (str) => {
    if (typeof str != "string") return str;
    var flagModes = { r: 0, "r+": 2, w: 512 | 64 | 1, "w+": 512 | 64 | 2, a: 1024 | 64 | 1, "a+": 1024 | 64 | 2 };
    var flags = flagModes[str];
    if (typeof flags == "undefined") {
      throw new Error(`Unknown file open mode: ${str}`);
    }
    return flags;
  };
  var FS_fileDataToTypedArray = (data) => {
    if (typeof data == "string") {
      data = intArrayFromString(data, true);
    }
    if (!data.subarray) {
      data = new Uint8Array(data);
    }
    return data;
  };
  var FS_getMode = (canRead, canWrite) => {
    var mode = 0;
    if (canRead) mode |= 292 | 73;
    if (canWrite) mode |= 146;
    return mode;
  };
  var asyncLoad = async (url) => {
    var arrayBuffer = await readAsync(url);
    return new Uint8Array(arrayBuffer);
  };
  var FS_createDataFile = (...args) => FS.createDataFile(...args);
  var getUniqueRunDependency = (id) => id;
  var runDependencies = 0;
  var dependenciesFulfilled = null;
  var removeRunDependency = (id) => {
    runDependencies--;
    Module["monitorRunDependencies"]?.(runDependencies);
    if (runDependencies == 0) {
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback();
      }
    }
  };
  var addRunDependency = (id) => {
    runDependencies++;
    Module["monitorRunDependencies"]?.(runDependencies);
  };
  var preloadPlugins = [];
  var FS_handledByPreloadPlugin = async (byteArray, fullname) => {
    if (typeof Browser != "undefined") Browser.init();
    for (var plugin of preloadPlugins) {
      if (plugin["canHandle"](fullname)) {
        return plugin["handle"](byteArray, fullname);
      }
    }
    return byteArray;
  };
  var FS_preloadFile = async (parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish) => {
    var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
    var dep = getUniqueRunDependency(`cp ${fullname}`);
    addRunDependency(dep);
    try {
      var byteArray = url;
      if (typeof url == "string") {
        byteArray = await asyncLoad(url);
      }
      byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);
      preFinish?.();
      if (!dontCreateFile) {
        FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
      }
    } finally {
      removeRunDependency(dep);
    }
  };
  var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
    FS_preloadFile(parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish).then(onload).catch(onerror);
  };
  var FS = { root: null, mounts: [], devices: {}, streams: [], nextInode: 1, nameTable: null, currentPath: "/", initialized: false, ignorePermissions: true, filesystems: null, syncFSRequests: 0, ErrnoError: class {
    name = "ErrnoError";
    constructor(errno) {
      this.errno = errno;
    }
  }, FSStream: class {
    shared = {};
    get object() {
      return this.node;
    }
    set object(val) {
      this.node = val;
    }
    get isRead() {
      return (this.flags & 2097155) !== 1;
    }
    get isWrite() {
      return (this.flags & 2097155) !== 0;
    }
    get isAppend() {
      return this.flags & 1024;
    }
    get flags() {
      return this.shared.flags;
    }
    set flags(val) {
      this.shared.flags = val;
    }
    get position() {
      return this.shared.position;
    }
    set position(val) {
      this.shared.position = val;
    }
  }, FSNode: class {
    node_ops = {};
    stream_ops = {};
    readMode = 292 | 73;
    writeMode = 146;
    mounted = null;
    constructor(parent, name, mode, rdev) {
      if (!parent) {
        parent = this;
      }
      this.parent = parent;
      this.mount = parent.mount;
      this.id = FS.nextInode++;
      this.name = name;
      this.mode = mode;
      this.rdev = rdev;
      this.atime = this.mtime = this.ctime = Date.now();
    }
    get read() {
      return (this.mode & this.readMode) === this.readMode;
    }
    set read(val) {
      val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
    }
    get write() {
      return (this.mode & this.writeMode) === this.writeMode;
    }
    set write(val) {
      val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
    }
    get isFolder() {
      return FS.isDir(this.mode);
    }
    get isDevice() {
      return FS.isChrdev(this.mode);
    }
  }, lookupPath(path, opts = {}) {
    if (!path) {
      throw new FS.ErrnoError(44);
    }
    opts.follow_mount ??= true;
    if (!PATH.isAbs(path)) {
      path = FS.cwd() + "/" + path;
    }
    linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
      var parts = path.split("/").filter((p) => !!p);
      var current = FS.root;
      var current_path = "/";
      for (var i = 0; i < parts.length; i++) {
        var islast = i === parts.length - 1;
        if (islast && opts.parent) {
          break;
        }
        if (parts[i] === ".") {
          continue;
        }
        if (parts[i] === "..") {
          current_path = PATH.dirname(current_path);
          if (FS.isRoot(current)) {
            path = current_path + "/" + parts.slice(i + 1).join("/");
            nlinks--;
            continue linkloop;
          } else {
            current = current.parent;
          }
          continue;
        }
        current_path = PATH.join2(current_path, parts[i]);
        try {
          current = FS.lookupNode(current, parts[i]);
        } catch (e) {
          if (e?.errno === 44 && islast && opts.noent_okay) {
            return { path: current_path };
          }
          throw e;
        }
        if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
          current = current.mounted.root;
        }
        if (FS.isLink(current.mode) && (!islast || opts.follow)) {
          if (!current.node_ops.readlink) {
            throw new FS.ErrnoError(52);
          }
          var link = current.node_ops.readlink(current);
          if (!PATH.isAbs(link)) {
            link = PATH.dirname(current_path) + "/" + link;
          }
          path = link + "/" + parts.slice(i + 1).join("/");
          continue linkloop;
        }
      }
      return { path: current_path, node: current };
    }
    throw new FS.ErrnoError(32);
  }, getPath(node) {
    var path;
    while (true) {
      if (FS.isRoot(node)) {
        var mount = node.mount.mountpoint;
        if (!path) return mount;
        return mount[mount.length - 1] !== "/" ? `${mount}/${path}` : mount + path;
      }
      path = path ? `${node.name}/${path}` : node.name;
      node = node.parent;
    }
  }, hashName(parentid, name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = (hash << 5) - hash + name.charCodeAt(i) | 0;
    }
    return (parentid + hash >>> 0) % FS.nameTable.length;
  }, hashAddNode(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    node.name_next = FS.nameTable[hash];
    FS.nameTable[hash] = node;
  }, hashRemoveNode(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    if (FS.nameTable[hash] === node) {
      FS.nameTable[hash] = node.name_next;
    } else {
      var current = FS.nameTable[hash];
      while (current) {
        if (current.name_next === node) {
          current.name_next = node.name_next;
          break;
        }
        current = current.name_next;
      }
    }
  }, lookupNode(parent, name) {
    var errCode = FS.mayLookup(parent);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    var hash = FS.hashName(parent.id, name);
    for (var node = FS.nameTable[hash]; node; node = node.name_next) {
      var nodeName = node.name;
      if (node.parent.id === parent.id && nodeName === name) {
        return node;
      }
    }
    return FS.lookup(parent, name);
  }, createNode(parent, name, mode, rdev) {
    var node = new FS.FSNode(parent, name, mode, rdev);
    FS.hashAddNode(node);
    return node;
  }, destroyNode(node) {
    FS.hashRemoveNode(node);
  }, isRoot(node) {
    return node === node.parent;
  }, isMountpoint(node) {
    return !!node.mounted;
  }, isFile(mode) {
    return (mode & 61440) === 32768;
  }, isDir(mode) {
    return (mode & 61440) === 16384;
  }, isLink(mode) {
    return (mode & 61440) === 40960;
  }, isChrdev(mode) {
    return (mode & 61440) === 8192;
  }, isBlkdev(mode) {
    return (mode & 61440) === 24576;
  }, isFIFO(mode) {
    return (mode & 61440) === 4096;
  }, isSocket(mode) {
    return (mode & 49152) === 49152;
  }, flagsToPermissionString(flag) {
    var perms = ["r", "w", "rw"][flag & 3];
    if (flag & 512) {
      perms += "w";
    }
    return perms;
  }, nodePermissions(node, perms) {
    if (FS.ignorePermissions) {
      return 0;
    }
    if (perms.includes("r") && !(node.mode & 292)) {
      return 2;
    }
    if (perms.includes("w") && !(node.mode & 146)) {
      return 2;
    }
    if (perms.includes("x") && !(node.mode & 73)) {
      return 2;
    }
    return 0;
  }, mayLookup(dir) {
    if (!FS.isDir(dir.mode)) return 54;
    var errCode = FS.nodePermissions(dir, "x");
    if (errCode) return errCode;
    if (!dir.node_ops.lookup) return 2;
    return 0;
  }, mayCreate(dir, name) {
    if (!FS.isDir(dir.mode)) {
      return 54;
    }
    try {
      var node = FS.lookupNode(dir, name);
      return 20;
    } catch (e) {
    }
    return FS.nodePermissions(dir, "wx");
  }, mayDelete(dir, name, isdir) {
    var node;
    try {
      node = FS.lookupNode(dir, name);
    } catch (e) {
      return e.errno;
    }
    var errCode = FS.nodePermissions(dir, "wx");
    if (errCode) {
      return errCode;
    }
    if (isdir) {
      if (!FS.isDir(node.mode)) {
        return 54;
      }
      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
        return 10;
      }
    } else if (FS.isDir(node.mode)) {
      return 31;
    }
    return 0;
  }, mayOpen(node, flags) {
    if (!node) {
      return 44;
    }
    if (FS.isLink(node.mode)) {
      return 32;
    }
    var mode = FS.flagsToPermissionString(flags);
    if (FS.isDir(node.mode)) {
      if (mode !== "r" || flags & (512 | 64)) {
        return 31;
      }
    }
    return FS.nodePermissions(node, mode);
  }, checkOpExists(op, err2) {
    if (!op) {
      throw new FS.ErrnoError(err2);
    }
    return op;
  }, MAX_OPEN_FDS: 4096, nextfd() {
    for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
      if (!FS.streams[fd]) {
        return fd;
      }
    }
    throw new FS.ErrnoError(33);
  }, getStreamChecked(fd) {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    return stream;
  }, getStream: (fd) => FS.streams[fd], createStream(stream, fd = -1) {
    stream = Object.assign(new FS.FSStream(), stream);
    if (fd == -1) {
      fd = FS.nextfd();
    }
    stream.fd = fd;
    FS.streams[fd] = stream;
    return stream;
  }, closeStream(fd) {
    FS.streams[fd] = null;
  }, dupStream(origStream, fd = -1) {
    var stream = FS.createStream(origStream, fd);
    stream.stream_ops?.dup?.(stream);
    return stream;
  }, doSetAttr(stream, node, attr) {
    var setattr = stream?.stream_ops.setattr;
    var arg = setattr ? stream : node;
    setattr ??= node.node_ops.setattr;
    FS.checkOpExists(setattr, 63);
    setattr(arg, attr);
  }, chrdev_stream_ops: { open(stream) {
    var device = FS.getDevice(stream.node.rdev);
    stream.stream_ops = device.stream_ops;
    stream.stream_ops.open?.(stream);
  }, llseek() {
    throw new FS.ErrnoError(70);
  } }, major: (dev) => dev >> 8, minor: (dev) => dev & 255, makedev: (ma, mi) => ma << 8 | mi, registerDevice(dev, ops) {
    FS.devices[dev] = { stream_ops: ops };
  }, getDevice: (dev) => FS.devices[dev], getMounts(mount) {
    var mounts = [];
    var check = [mount];
    while (check.length) {
      var m = check.pop();
      mounts.push(m);
      check.push(...m.mounts);
    }
    return mounts;
  }, syncfs(populate, callback) {
    if (typeof populate == "function") {
      callback = populate;
      populate = false;
    }
    FS.syncFSRequests++;
    if (FS.syncFSRequests > 1) {
      err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
    }
    var mounts = FS.getMounts(FS.root.mount);
    var completed = 0;
    function doCallback(errCode) {
      FS.syncFSRequests--;
      return callback(errCode);
    }
    function done(errCode) {
      if (errCode) {
        if (!done.errored) {
          done.errored = true;
          return doCallback(errCode);
        }
        return;
      }
      if (++completed >= mounts.length) {
        doCallback(null);
      }
    }
    for (var mount of mounts) {
      if (mount.type.syncfs) {
        mount.type.syncfs(mount, populate, done);
      } else {
        done(null);
      }
    }
  }, mount(type, opts, mountpoint) {
    var root = mountpoint === "/";
    var pseudo = !mountpoint;
    var node;
    if (root && FS.root) {
      throw new FS.ErrnoError(10);
    } else if (!root && !pseudo) {
      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
      mountpoint = lookup.path;
      node = lookup.node;
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(10);
      }
      if (!FS.isDir(node.mode)) {
        throw new FS.ErrnoError(54);
      }
    }
    var mount = { type, opts, mountpoint, mounts: [] };
    var mountRoot = type.mount(mount);
    mountRoot.mount = mount;
    mount.root = mountRoot;
    if (root) {
      FS.root = mountRoot;
    } else if (node) {
      node.mounted = mount;
      if (node.mount) {
        node.mount.mounts.push(mount);
      }
    }
    return mountRoot;
  }, unmount(mountpoint) {
    var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
    if (!FS.isMountpoint(lookup.node)) {
      throw new FS.ErrnoError(28);
    }
    var node = lookup.node;
    var mount = node.mounted;
    var mounts = FS.getMounts(mount);
    for (var [hash, current] of Object.entries(FS.nameTable)) {
      while (current) {
        var next = current.name_next;
        if (mounts.includes(current.mount)) {
          FS.destroyNode(current);
        }
        current = next;
      }
    }
    node.mounted = null;
    var idx = node.mount.mounts.indexOf(mount);
    node.mount.mounts.splice(idx, 1);
  }, lookup(parent, name) {
    return parent.node_ops.lookup(parent, name);
  }, mknod(path, mode, dev) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name) {
      throw new FS.ErrnoError(28);
    }
    if (name === "." || name === "..") {
      throw new FS.ErrnoError(20);
    }
    var errCode = FS.mayCreate(parent, name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.mknod) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  }, statfs(path) {
    return FS.statfsNode(FS.lookupPath(path, { follow: true }).node);
  }, statfsStream(stream) {
    return FS.statfsNode(stream.node);
  }, statfsNode(node) {
    var rtn = { bsize: 4096, frsize: 4096, blocks: 1e6, bfree: 5e5, bavail: 5e5, files: FS.nextInode, ffree: FS.nextInode - 1, fsid: 42, flags: 2, namelen: 255 };
    if (node.node_ops.statfs) {
      Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));
    }
    return rtn;
  }, create(path, mode = 438) {
    mode &= 4095;
    mode |= 32768;
    return FS.mknod(path, mode, 0);
  }, mkdir(path, mode = 511) {
    mode &= 511 | 512;
    mode |= 16384;
    return FS.mknod(path, mode, 0);
  }, mkdirTree(path, mode) {
    var dirs = path.split("/");
    var d = "";
    for (var dir of dirs) {
      if (!dir) continue;
      if (d || PATH.isAbs(path)) d += "/";
      d += dir;
      try {
        FS.mkdir(d, mode);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
    }
  }, mkdev(path, mode, dev) {
    if (typeof dev == "undefined") {
      dev = mode;
      mode = 438;
    }
    mode |= 8192;
    return FS.mknod(path, mode, dev);
  }, symlink(oldpath, newpath) {
    if (!PATH_FS.resolve(oldpath)) {
      throw new FS.ErrnoError(44);
    }
    var lookup = FS.lookupPath(newpath, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var newname = PATH.basename(newpath);
    var errCode = FS.mayCreate(parent, newname);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.symlink) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.symlink(parent, newname, oldpath);
  }, rename(old_path, new_path) {
    var old_dirname = PATH.dirname(old_path);
    var new_dirname = PATH.dirname(new_path);
    var old_name = PATH.basename(old_path);
    var new_name = PATH.basename(new_path);
    var lookup, old_dir, new_dir;
    lookup = FS.lookupPath(old_path, { parent: true });
    old_dir = lookup.node;
    lookup = FS.lookupPath(new_path, { parent: true });
    new_dir = lookup.node;
    if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
    if (old_dir.mount !== new_dir.mount) {
      throw new FS.ErrnoError(75);
    }
    var old_node = FS.lookupNode(old_dir, old_name);
    var relative = PATH_FS.relative(old_path, new_dirname);
    if (relative.charAt(0) !== ".") {
      throw new FS.ErrnoError(28);
    }
    relative = PATH_FS.relative(new_path, old_dirname);
    if (relative.charAt(0) !== ".") {
      throw new FS.ErrnoError(55);
    }
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {
    }
    if (old_node === new_node) {
      return;
    }
    var isdir = FS.isDir(old_node.mode);
    var errCode = FS.mayDelete(old_dir, old_name, isdir);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!old_dir.node_ops.rename) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
      throw new FS.ErrnoError(10);
    }
    if (new_dir !== old_dir) {
      errCode = FS.nodePermissions(old_dir, "w");
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    FS.hashRemoveNode(old_node);
    try {
      old_dir.node_ops.rename(old_node, new_dir, new_name);
      old_node.parent = new_dir;
    } catch (e) {
      throw e;
    } finally {
      FS.hashAddNode(old_node);
    }
  }, rmdir(path) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, true);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.rmdir) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.rmdir(parent, name);
    FS.destroyNode(node);
  }, readdir(path) {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
    return readdir(node);
  }, unlink(path) {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, false);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.unlink) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.unlink(parent, name);
    FS.destroyNode(node);
  }, readlink(path) {
    var lookup = FS.lookupPath(path);
    var link = lookup.node;
    if (!link) {
      throw new FS.ErrnoError(44);
    }
    if (!link.node_ops.readlink) {
      throw new FS.ErrnoError(28);
    }
    return link.node_ops.readlink(link);
  }, stat(path, dontFollow) {
    var lookup = FS.lookupPath(path, { follow: !dontFollow });
    var node = lookup.node;
    var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
    return getattr(node);
  }, fstat(fd) {
    var stream = FS.getStreamChecked(fd);
    var node = stream.node;
    var getattr = stream.stream_ops.getattr;
    var arg = getattr ? stream : node;
    getattr ??= node.node_ops.getattr;
    FS.checkOpExists(getattr, 63);
    return getattr(arg);
  }, lstat(path) {
    return FS.stat(path, true);
  }, doChmod(stream, node, mode, dontFollow) {
    FS.doSetAttr(stream, node, { mode: mode & 4095 | node.mode & ~4095, ctime: Date.now(), dontFollow });
  }, chmod(path, mode, dontFollow) {
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doChmod(null, node, mode, dontFollow);
  }, lchmod(path, mode) {
    FS.chmod(path, mode, true);
  }, fchmod(fd, mode) {
    var stream = FS.getStreamChecked(fd);
    FS.doChmod(stream, stream.node, mode, false);
  }, doChown(stream, node, dontFollow) {
    FS.doSetAttr(stream, node, { timestamp: Date.now(), dontFollow });
  }, chown(path, uid, gid, dontFollow) {
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doChown(null, node, dontFollow);
  }, lchown(path, uid, gid) {
    FS.chown(path, uid, gid, true);
  }, fchown(fd, uid, gid) {
    var stream = FS.getStreamChecked(fd);
    FS.doChown(stream, stream.node, false);
  }, doTruncate(stream, node, len) {
    if (FS.isDir(node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!FS.isFile(node.mode)) {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.nodePermissions(node, "w");
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.doSetAttr(stream, node, { size: len, timestamp: Date.now() });
  }, truncate(path, len) {
    if (len < 0) {
      throw new FS.ErrnoError(28);
    }
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: true });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doTruncate(null, node, len);
  }, ftruncate(fd, len) {
    var stream = FS.getStreamChecked(fd);
    if (len < 0 || (stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(28);
    }
    FS.doTruncate(stream, stream.node, len);
  }, utime(path, atime, mtime) {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    var setattr = FS.checkOpExists(node.node_ops.setattr, 63);
    setattr(node, { atime, mtime });
  }, open(path, flags, mode = 438) {
    if (path === "") {
      throw new FS.ErrnoError(44);
    }
    flags = FS_modeStringToFlags(flags);
    if (flags & 64) {
      mode = mode & 4095 | 32768;
    } else {
      mode = 0;
    }
    var node;
    var isDirPath;
    if (typeof path == "object") {
      node = path;
    } else {
      isDirPath = path.endsWith("/");
      var lookup = FS.lookupPath(path, { follow: !(flags & 131072), noent_okay: true });
      node = lookup.node;
      path = lookup.path;
    }
    var created = false;
    if (flags & 64) {
      if (node) {
        if (flags & 128) {
          throw new FS.ErrnoError(20);
        }
      } else if (isDirPath) {
        throw new FS.ErrnoError(31);
      } else {
        node = FS.mknod(path, mode | 511, 0);
        created = true;
      }
    }
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    if (FS.isChrdev(node.mode)) {
      flags &= ~512;
    }
    if (flags & 65536 && !FS.isDir(node.mode)) {
      throw new FS.ErrnoError(54);
    }
    if (!created) {
      var errCode = FS.mayOpen(node, flags);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    if (flags & 512 && !created) {
      FS.truncate(node, 0);
    }
    flags &= ~(128 | 512 | 131072);
    var stream = FS.createStream({ node, path: FS.getPath(node), flags, seekable: true, position: 0, stream_ops: node.stream_ops, ungotten: [], error: false });
    if (stream.stream_ops.open) {
      stream.stream_ops.open(stream);
    }
    if (created) {
      FS.chmod(node, mode & 511);
    }
    return stream;
  }, close(stream) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (stream.getdents) stream.getdents = null;
    try {
      if (stream.stream_ops.close) {
        stream.stream_ops.close(stream);
      }
    } catch (e) {
      throw e;
    } finally {
      FS.closeStream(stream.fd);
    }
    stream.fd = null;
  }, isClosed(stream) {
    return stream.fd === null;
  }, llseek(stream, offset, whence) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (!stream.seekable || !stream.stream_ops.llseek) {
      throw new FS.ErrnoError(70);
    }
    if (whence != 0 && whence != 1 && whence != 2) {
      throw new FS.ErrnoError(28);
    }
    stream.position = stream.stream_ops.llseek(stream, offset, whence);
    stream.ungotten = [];
    return stream.position;
  }, read(stream, buffer, offset, length, position) {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.read) {
      throw new FS.ErrnoError(28);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
    if (!seeking) stream.position += bytesRead;
    return bytesRead;
  }, write(stream, buffer, offset, length, position, canOwn) {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.write) {
      throw new FS.ErrnoError(28);
    }
    if (stream.seekable && stream.flags & 1024) {
      FS.llseek(stream, 0, 2);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
    if (!seeking) stream.position += bytesWritten;
    return bytesWritten;
  }, mmap(stream, length, position, prot, flags) {
    if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
      throw new FS.ErrnoError(2);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(2);
    }
    if (!stream.stream_ops.mmap) {
      throw new FS.ErrnoError(43);
    }
    if (!length) {
      throw new FS.ErrnoError(28);
    }
    return stream.stream_ops.mmap(stream, length, position, prot, flags);
  }, msync(stream, buffer, offset, length, mmapFlags) {
    if (!stream.stream_ops.msync) {
      return 0;
    }
    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
  }, ioctl(stream, cmd, arg) {
    if (!stream.stream_ops.ioctl) {
      throw new FS.ErrnoError(59);
    }
    return stream.stream_ops.ioctl(stream, cmd, arg);
  }, readFile(path, opts = {}) {
    opts.flags = opts.flags || 0;
    opts.encoding = opts.encoding || "binary";
    if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
      abort(`Invalid encoding type "${opts.encoding}"`);
    }
    var stream = FS.open(path, opts.flags);
    var stat = FS.stat(path);
    var length = stat.size;
    var buf = new Uint8Array(length);
    FS.read(stream, buf, 0, length, 0);
    if (opts.encoding === "utf8") {
      buf = UTF8ArrayToString(buf);
    }
    FS.close(stream);
    return buf;
  }, writeFile(path, data, opts = {}) {
    opts.flags = opts.flags || 577;
    var stream = FS.open(path, opts.flags, opts.mode);
    data = FS_fileDataToTypedArray(data);
    FS.write(stream, data, 0, data.byteLength, void 0, opts.canOwn);
    FS.close(stream);
  }, cwd: () => FS.currentPath, chdir(path) {
    var lookup = FS.lookupPath(path, { follow: true });
    if (lookup.node === null) {
      throw new FS.ErrnoError(44);
    }
    if (!FS.isDir(lookup.node.mode)) {
      throw new FS.ErrnoError(54);
    }
    var errCode = FS.nodePermissions(lookup.node, "x");
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.currentPath = lookup.path;
  }, createDefaultDirectories() {
    FS.mkdir("/tmp");
    FS.mkdir("/home");
    FS.mkdir("/home/web_user");
  }, createDefaultDevices() {
    FS.mkdir("/dev");
    FS.registerDevice(FS.makedev(1, 3), { read: () => 0, write: (stream, buffer, offset, length, pos) => length, llseek: () => 0 });
    FS.mkdev("/dev/null", FS.makedev(1, 3));
    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
    FS.mkdev("/dev/tty", FS.makedev(5, 0));
    FS.mkdev("/dev/tty1", FS.makedev(6, 0));
    var randomBuffer = new Uint8Array(1024), randomLeft = 0;
    var randomByte = () => {
      if (randomLeft === 0) {
        randomFill(randomBuffer);
        randomLeft = randomBuffer.byteLength;
      }
      return randomBuffer[--randomLeft];
    };
    FS.createDevice("/dev", "random", randomByte);
    FS.createDevice("/dev", "urandom", randomByte);
    FS.mkdir("/dev/shm");
    FS.mkdir("/dev/shm/tmp");
  }, createSpecialDirectories() {
    FS.mkdir("/proc");
    var proc_self = FS.mkdir("/proc/self");
    FS.mkdir("/proc/self/fd");
    FS.mount({ mount() {
      var node = FS.createNode(proc_self, "fd", 16895, 73);
      node.stream_ops = { llseek: MEMFS.stream_ops.llseek };
      node.node_ops = { lookup(parent, name) {
        var fd = +name;
        var stream = FS.getStreamChecked(fd);
        var ret = { parent: null, mount: { mountpoint: "fake" }, node_ops: { readlink: () => stream.path }, id: fd + 1 };
        ret.parent = ret;
        return ret;
      }, readdir() {
        return Array.from(FS.streams.entries()).filter(([k, v]) => v).map(([k, v]) => k.toString());
      } };
      return node;
    } }, {}, "/proc/self/fd");
  }, createStandardStreams(input, output, error) {
    if (input) {
      FS.createDevice("/dev", "stdin", input);
    } else {
      FS.symlink("/dev/tty", "/dev/stdin");
    }
    if (output) {
      FS.createDevice("/dev", "stdout", null, output);
    } else {
      FS.symlink("/dev/tty", "/dev/stdout");
    }
    if (error) {
      FS.createDevice("/dev", "stderr", null, error);
    } else {
      FS.symlink("/dev/tty1", "/dev/stderr");
    }
    var stdin = FS.open("/dev/stdin", 0);
    var stdout = FS.open("/dev/stdout", 1);
    var stderr = FS.open("/dev/stderr", 1);
  }, staticInit() {
    FS.nameTable = new Array(4096);
    FS.mount(MEMFS, {}, "/");
    FS.createDefaultDirectories();
    FS.createDefaultDevices();
    FS.createSpecialDirectories();
    FS.filesystems = { MEMFS };
  }, init(input, output, error) {
    FS.initialized = true;
    input ??= Module["stdin"];
    output ??= Module["stdout"];
    error ??= Module["stderr"];
    FS.createStandardStreams(input, output, error);
  }, quit() {
    FS.initialized = false;
    for (var stream of FS.streams) {
      if (stream) {
        FS.close(stream);
      }
    }
  }, findObject(path, dontResolveLastLink) {
    var ret = FS.analyzePath(path, dontResolveLastLink);
    if (!ret.exists) {
      return null;
    }
    return ret.object;
  }, analyzePath(path, dontResolveLastLink) {
    try {
      var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      path = lookup.path;
    } catch (e) {
    }
    var ret = { isRoot: false, exists: false, error: 0, name: null, path: null, object: null, parentExists: false, parentPath: null, parentObject: null };
    try {
      var lookup = FS.lookupPath(path, { parent: true });
      ret.parentExists = true;
      ret.parentPath = lookup.path;
      ret.parentObject = lookup.node;
      ret.name = PATH.basename(path);
      lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      ret.exists = true;
      ret.path = lookup.path;
      ret.object = lookup.node;
      ret.name = lookup.node.name;
      ret.isRoot = lookup.path === "/";
    } catch (e) {
      ret.error = e.errno;
    }
    return ret;
  }, createPath(parent, path, canRead, canWrite) {
    parent = typeof parent == "string" ? parent : FS.getPath(parent);
    var parts = path.split("/").reverse();
    while (parts.length) {
      var part = parts.pop();
      if (!part) continue;
      var current = PATH.join2(parent, part);
      try {
        FS.mkdir(current);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
      parent = current;
    }
    return current;
  }, createFile(parent, name, properties, canRead, canWrite) {
    var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
    var mode = FS_getMode(canRead, canWrite);
    return FS.create(path, mode);
  }, createDataFile(parent, name, data, canRead, canWrite, canOwn) {
    var path = name;
    if (parent) {
      parent = typeof parent == "string" ? parent : FS.getPath(parent);
      path = name ? PATH.join2(parent, name) : parent;
    }
    var mode = FS_getMode(canRead, canWrite);
    var node = FS.create(path, mode);
    if (data) {
      data = FS_fileDataToTypedArray(data);
      FS.chmod(node, mode | 146);
      var stream = FS.open(node, 577);
      FS.write(stream, data, 0, data.length, 0, canOwn);
      FS.close(stream);
      FS.chmod(node, mode);
    }
  }, createDevice(parent, name, input, output) {
    var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
    var mode = FS_getMode(!!input, !!output);
    FS.createDevice.major ??= 64;
    var dev = FS.makedev(FS.createDevice.major++, 0);
    FS.registerDevice(dev, { open(stream) {
      stream.seekable = false;
    }, close(stream) {
      if (output?.buffer?.length) {
        output(10);
      }
    }, read(stream, buffer, offset, length, pos) {
      var bytesRead = 0;
      for (var i = 0; i < length; i++) {
        var result;
        try {
          result = input();
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
        if (result === void 0 && bytesRead === 0) {
          throw new FS.ErrnoError(6);
        }
        if (result === null || result === void 0) break;
        bytesRead++;
        buffer[offset + i] = result;
      }
      if (bytesRead) {
        stream.node.atime = Date.now();
      }
      return bytesRead;
    }, write(stream, buffer, offset, length, pos) {
      for (var i = 0; i < length; i++) {
        try {
          output(buffer[offset + i]);
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
      }
      if (length) {
        stream.node.mtime = stream.node.ctime = Date.now();
      }
      return i;
    } });
    return FS.mkdev(path, mode, dev);
  }, forceLoadFile(obj) {
    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
    if (globalThis.XMLHttpRequest) {
      abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
    } else {
      try {
        obj.contents = readBinary(obj.url);
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
    }
  }, createLazyFile(parent, name, url, canRead, canWrite) {
    class LazyUint8Array {
      lengthKnown = false;
      chunks = [];
      get(idx) {
        if (idx > this.length - 1 || idx < 0) {
          return void 0;
        }
        var chunkOffset = idx % this.chunkSize;
        var chunkNum = idx / this.chunkSize | 0;
        return this.getter(chunkNum)[chunkOffset];
      }
      setDataGetter(getter) {
        this.getter = getter;
      }
      cacheLength() {
        var xhr = new XMLHttpRequest();
        xhr.open("HEAD", url, false);
        xhr.send(null);
        if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) abort("Couldn't load " + url + ". Status: " + xhr.status);
        var datalength = Number(xhr.getResponseHeader("Content-length"));
        var header;
        var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
        var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
        var chunkSize = 1024 * 1024;
        if (!hasByteServing) chunkSize = datalength;
        var doXHR = (from, to) => {
          if (from > to) abort("invalid range (" + from + ", " + to + ") or no bytes requested!");
          if (to > datalength - 1) abort("only " + datalength + " bytes available! programmer error!");
          var xhr2 = new XMLHttpRequest();
          xhr2.open("GET", url, false);
          if (datalength !== chunkSize) xhr2.setRequestHeader("Range", "bytes=" + from + "-" + to);
          xhr2.responseType = "arraybuffer";
          if (xhr2.overrideMimeType) {
            xhr2.overrideMimeType("text/plain; charset=x-user-defined");
          }
          xhr2.send(null);
          if (!(xhr2.status >= 200 && xhr2.status < 300 || xhr2.status === 304)) abort("Couldn't load " + url + ". Status: " + xhr2.status);
          if (xhr2.response !== void 0) {
            return new Uint8Array(xhr2.response || []);
          }
          return intArrayFromString(xhr2.responseText || "", true);
        };
        var lazyArray2 = this;
        lazyArray2.setDataGetter((chunkNum) => {
          var start = chunkNum * chunkSize;
          var end = (chunkNum + 1) * chunkSize - 1;
          end = Math.min(end, datalength - 1);
          if (typeof lazyArray2.chunks[chunkNum] == "undefined") {
            lazyArray2.chunks[chunkNum] = doXHR(start, end);
          }
          if (typeof lazyArray2.chunks[chunkNum] == "undefined") abort("doXHR failed!");
          return lazyArray2.chunks[chunkNum];
        });
        if (usesGzip || !datalength) {
          chunkSize = datalength = 1;
          datalength = this.getter(0).length;
          chunkSize = datalength;
          out("LazyFiles on gzip forces download of the whole file when length is accessed");
        }
        this._length = datalength;
        this._chunkSize = chunkSize;
        this.lengthKnown = true;
      }
      get length() {
        if (!this.lengthKnown) {
          this.cacheLength();
        }
        return this._length;
      }
      get chunkSize() {
        if (!this.lengthKnown) {
          this.cacheLength();
        }
        return this._chunkSize;
      }
    }
    if (globalThis.XMLHttpRequest) {
      if (!ENVIRONMENT_IS_WORKER) abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
      var lazyArray = new LazyUint8Array();
      var properties = { isDevice: false, contents: lazyArray };
    } else {
      var properties = { isDevice: false, url };
    }
    var node = FS.createFile(parent, name, properties, canRead, canWrite);
    if (properties.contents) {
      node.contents = properties.contents;
    } else if (properties.url) {
      node.contents = null;
      node.url = properties.url;
    }
    Object.defineProperties(node, { usedBytes: { get: function() {
      return this.contents.length;
    } } });
    var stream_ops = {};
    for (const [key, fn] of Object.entries(node.stream_ops)) {
      stream_ops[key] = (...args) => {
        FS.forceLoadFile(node);
        return fn(...args);
      };
    }
    function writeChunks(stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= contents.length) return 0;
      var size = Math.min(contents.length - position, length);
      if (contents.slice) {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents[position + i];
        }
      } else {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents.get(position + i);
        }
      }
      return size;
    }
    stream_ops.read = (stream, buffer, offset, length, position) => {
      FS.forceLoadFile(node);
      return writeChunks(stream, buffer, offset, length, position);
    };
    stream_ops.mmap = (stream, length, position, prot, flags) => {
      FS.forceLoadFile(node);
      var ptr = mmapAlloc(length);
      if (!ptr) {
        throw new FS.ErrnoError(48);
      }
      writeChunks(stream, HEAP8, ptr, length, position);
      return { ptr, allocated: true };
    };
    node.stream_ops = stream_ops;
    return node;
  } };
  var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "";
  var SYSCALLS = { calculateAt(dirfd, path, allowEmpty) {
    if (PATH.isAbs(path)) {
      return path;
    }
    var dir;
    if (dirfd === -100) {
      dir = FS.cwd();
    } else {
      var dirstream = SYSCALLS.getStreamFromFD(dirfd);
      dir = dirstream.path;
    }
    if (path.length == 0) {
      if (!allowEmpty) {
        throw new FS.ErrnoError(44);
      }
      return dir;
    }
    return dir + "/" + path;
  }, writeStat(buf, stat) {
    HEAPU32[buf >> 2] = stat.dev;
    HEAPU32[buf + 4 >> 2] = stat.mode;
    HEAPU32[buf + 8 >> 2] = stat.nlink;
    HEAPU32[buf + 12 >> 2] = stat.uid;
    HEAPU32[buf + 16 >> 2] = stat.gid;
    HEAPU32[buf + 20 >> 2] = stat.rdev;
    HEAP64[buf + 24 >> 3] = BigInt(stat.size);
    HEAP32[buf + 32 >> 2] = 4096;
    HEAP32[buf + 36 >> 2] = stat.blocks;
    var atime = stat.atime.getTime();
    var mtime = stat.mtime.getTime();
    var ctime = stat.ctime.getTime();
    HEAP64[buf + 40 >> 3] = BigInt(Math.floor(atime / 1e3));
    HEAPU32[buf + 48 >> 2] = atime % 1e3 * 1e3 * 1e3;
    HEAP64[buf + 56 >> 3] = BigInt(Math.floor(mtime / 1e3));
    HEAPU32[buf + 64 >> 2] = mtime % 1e3 * 1e3 * 1e3;
    HEAP64[buf + 72 >> 3] = BigInt(Math.floor(ctime / 1e3));
    HEAPU32[buf + 80 >> 2] = ctime % 1e3 * 1e3 * 1e3;
    HEAP64[buf + 88 >> 3] = BigInt(stat.ino);
    return 0;
  }, writeStatFs(buf, stats) {
    HEAPU32[buf + 4 >> 2] = stats.bsize;
    HEAPU32[buf + 60 >> 2] = stats.bsize;
    HEAP64[buf + 8 >> 3] = BigInt(stats.blocks);
    HEAP64[buf + 16 >> 3] = BigInt(stats.bfree);
    HEAP64[buf + 24 >> 3] = BigInt(stats.bavail);
    HEAP64[buf + 32 >> 3] = BigInt(stats.files);
    HEAP64[buf + 40 >> 3] = BigInt(stats.ffree);
    HEAPU32[buf + 48 >> 2] = stats.fsid;
    HEAPU32[buf + 64 >> 2] = stats.flags;
    HEAPU32[buf + 56 >> 2] = stats.namelen;
  }, doMsync(addr, stream, len, flags, offset) {
    if (!FS.isFile(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    if (flags & 2) {
      return 0;
    }
    var buffer = HEAPU8.slice(addr, addr + len);
    FS.msync(stream, buffer, offset, len, flags);
  }, getStreamFromFD(fd) {
    var stream = FS.getStreamChecked(fd);
    return stream;
  }, varargs: void 0, getStr(ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
  } };
  function ___syscall_fcntl64(fd, cmd, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (cmd) {
        case 0: {
          var arg = syscallGetVarargI();
          if (arg < 0) {
            return -28;
          }
          while (FS.streams[arg]) {
            arg++;
          }
          var newStream;
          newStream = FS.dupStream(stream, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;
        case 3:
          return stream.flags;
        case 4: {
          var arg = syscallGetVarargI();
          stream.flags |= arg;
          return 0;
        }
        case 12: {
          var arg = syscallGetVarargP();
          var offset = 0;
          HEAP16[arg + offset >> 1] = 2;
          return 0;
        }
        case 13:
        case 14:
          return 0;
      }
      return -28;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return -e.errno;
    }
  }
  function ___syscall_ioctl(fd, op, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (op) {
        case 21509: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21505: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcgets) {
            var termios = stream.tty.ops.ioctl_tcgets(stream);
            var argp = syscallGetVarargP();
            HEAP32[argp >> 2] = termios.c_iflag || 0;
            HEAP32[argp + 4 >> 2] = termios.c_oflag || 0;
            HEAP32[argp + 8 >> 2] = termios.c_cflag || 0;
            HEAP32[argp + 12 >> 2] = termios.c_lflag || 0;
            for (var i = 0; i < 32; i++) {
              HEAP8[argp + i + 17] = termios.c_cc[i] || 0;
            }
            return 0;
          }
          return 0;
        }
        case 21510:
        case 21511:
        case 21512: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcsets) {
            var argp = syscallGetVarargP();
            var c_iflag = HEAP32[argp >> 2];
            var c_oflag = HEAP32[argp + 4 >> 2];
            var c_cflag = HEAP32[argp + 8 >> 2];
            var c_lflag = HEAP32[argp + 12 >> 2];
            var c_cc = [];
            for (var i = 0; i < 32; i++) {
              c_cc.push(HEAP8[argp + i + 17]);
            }
            return stream.tty.ops.ioctl_tcsets(stream.tty, op, { c_iflag, c_oflag, c_cflag, c_lflag, c_cc });
          }
          return 0;
        }
        case 21519: {
          if (!stream.tty) return -59;
          var argp = syscallGetVarargP();
          HEAP32[argp >> 2] = 0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -59;
          return -28;
        }
        case 21537:
        case 21531: {
          var argp = syscallGetVarargP();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tiocgwinsz) {
            var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
            var argp = syscallGetVarargP();
            HEAP16[argp >> 1] = winsize[0];
            HEAP16[argp + 2 >> 1] = winsize[1];
          }
          return 0;
        }
        case 21524: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21515: {
          if (!stream.tty) return -59;
          return 0;
        }
        default:
          return -28;
      }
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return -e.errno;
    }
  }
  function ___syscall_openat(dirfd, path, flags, varargs) {
    SYSCALLS.varargs = varargs;
    try {
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      var mode = varargs ? syscallGetVarargI() : 0;
      return FS.open(path, flags, mode).fd;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return -e.errno;
    }
  }
  function ___syscall_stat64(path, buf) {
    try {
      path = SYSCALLS.getStr(path);
      return SYSCALLS.writeStat(buf, FS.stat(path));
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return -e.errno;
    }
  }
  var __abort_js = () => abort("");
  var runtimeKeepaliveCounter = 0;
  var __emscripten_runtime_keepalive_clear = () => {
    noExitRuntime = false;
    runtimeKeepaliveCounter = 0;
  };
  var INT53_MAX = 9007199254740992;
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);
  function __munmap_js(addr, len, prot, flags, fd, offset) {
    offset = bigintToI53Checked(offset);
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      if (prot & 2) {
        SYSCALLS.doMsync(addr, stream, len, flags, offset);
      }
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return -e.errno;
    }
  }
  var timers = {};
  var handleException = (e) => {
    if (e instanceof ExitStatus || e == "unwind") {
      return EXITSTATUS;
    }
    quit_(1, e);
  };
  var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
  var _proc_exit = (code) => {
    EXITSTATUS = code;
    if (!keepRuntimeAlive()) {
      Module["onExit"]?.(code);
      ABORT = true;
    }
    quit_(code, new ExitStatus(code));
  };
  var exitJS = (status, implicit) => {
    EXITSTATUS = status;
    _proc_exit(status);
  };
  var _exit = exitJS;
  var maybeExit = () => {
    if (!keepRuntimeAlive()) {
      try {
        _exit(EXITSTATUS);
      } catch (e) {
        handleException(e);
      }
    }
  };
  var callUserCallback = (func) => {
    if (ABORT) {
      return;
    }
    try {
      return func();
    } catch (e) {
      handleException(e);
    } finally {
      maybeExit();
    }
  };
  var _emscripten_get_now = () => performance.now();
  var __setitimer_js = (which, timeout_ms) => {
    if (timers[which]) {
      clearTimeout(timers[which].id);
      delete timers[which];
    }
    if (!timeout_ms) return 0;
    var id = setTimeout(() => {
      delete timers[which];
      callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
    }, timeout_ms);
    timers[which] = { id, timeout_ms };
    return 0;
  };
  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
  var __tzset_js = (timezone, daylight, std_name, dst_name) => {
    var currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    var winter = new Date(currentYear, 0, 1);
    var summer = new Date(currentYear, 6, 1);
    var winterOffset = winter.getTimezoneOffset();
    var summerOffset = summer.getTimezoneOffset();
    var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
    HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
    HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
    var extractZone = (timezoneOffset) => {
      var sign = timezoneOffset >= 0 ? "-" : "+";
      var absOffset = Math.abs(timezoneOffset);
      var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
      var minutes = String(absOffset % 60).padStart(2, "0");
      return `UTC${sign}${hours}${minutes}`;
    };
    var winterName = extractZone(winterOffset);
    var summerName = extractZone(summerOffset);
    if (summerOffset < winterOffset) {
      stringToUTF8(winterName, std_name, 17);
      stringToUTF8(summerName, dst_name, 17);
    } else {
      stringToUTF8(winterName, dst_name, 17);
      stringToUTF8(summerName, std_name, 17);
    }
  };
  var _emscripten_date_now = () => Date.now();
  var nowIsMonotonic = 1;
  var checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;
  function _clock_time_get(clk_id, ignored_precision, ptime) {
    ignored_precision = bigintToI53Checked(ignored_precision);
    if (!checkWasiClock(clk_id)) {
      return 28;
    }
    var now;
    if (clk_id === 0) {
      now = _emscripten_date_now();
    } else if (nowIsMonotonic) {
      now = _emscripten_get_now();
    } else {
      return 52;
    }
    var nsec = Math.round(now * 1e3 * 1e3);
    HEAP64[ptime >> 3] = BigInt(nsec);
    return 0;
  }
  var readEmAsmArgsArray = [];
  var readEmAsmArgs = (sigPtr, buf) => {
    readEmAsmArgsArray.length = 0;
    var ch;
    while (ch = HEAPU8[sigPtr++]) {
      var wide = ch != 105;
      wide &= ch != 112;
      buf += wide && buf % 8 ? 4 : 0;
      readEmAsmArgsArray.push(ch == 112 ? HEAPU32[buf >> 2] : ch == 106 ? HEAP64[buf >> 3] : ch == 105 ? HEAP32[buf >> 2] : HEAPF64[buf >> 3]);
      buf += wide ? 8 : 4;
    }
    return readEmAsmArgsArray;
  };
  var runEmAsmFunction = (code, sigPtr, argbuf) => {
    var args = readEmAsmArgs(sigPtr, argbuf);
    return ASM_CONSTS[code](...args);
  };
  var _emscripten_asm_const_int = (code, sigPtr, argbuf) => runEmAsmFunction(code, sigPtr, argbuf);
  var _emscripten_errn = (str, len) => err(UTF8ToString(str, len));
  var UNWIND_CACHE = {};
  var stringToNewUTF8 = (str) => {
    var size = lengthBytesUTF8(str) + 1;
    var ret = _malloc(size);
    if (ret) stringToUTF8(str, ret, size);
    return ret;
  };
  var convertFrameToPC = (frame) => {
    var match;
    if (match = /\bwasm-function\[\d+\]:(0x[0-9a-f]+)/.exec(frame)) {
      return +match[1];
    } else if (match = /:(\d+):\d+(?:\)|$)/.exec(frame)) {
      return 2147483648 | +match[1];
    }
    return 0;
  };
  var saveInUnwindCache = (callstack) => {
    for (var line of callstack) {
      var pc = convertFrameToPC(line);
      if (pc) {
        UNWIND_CACHE[pc] = line;
      }
    }
  };
  var jsStackTrace = () => new Error().stack.toString();
  var _emscripten_stack_snapshot = () => {
    var callstack = jsStackTrace().split("\n");
    if (callstack[0] == "Error") {
      callstack.shift();
    }
    saveInUnwindCache(callstack);
    UNWIND_CACHE.last_addr = convertFrameToPC(callstack[3]);
    UNWIND_CACHE.last_stack = callstack;
    return UNWIND_CACHE.last_addr;
  };
  var _emscripten_pc_get_function = (pc) => {
    var frame = UNWIND_CACHE[pc];
    if (!frame) return 0;
    var name;
    var match;
    if (match = /^\s+at .*\.wasm\.(.*) \(.*\)$/.exec(frame)) {
      name = match[1];
    } else if (match = /^\s+at (.*) \(.*\)$/.exec(frame)) {
      name = match[1];
    } else if (match = /^(.+?)@/.exec(frame)) {
      name = match[1];
    } else {
      return 0;
    }
    _free(_emscripten_pc_get_function.ret ?? 0);
    _emscripten_pc_get_function.ret = stringToNewUTF8(name);
    return _emscripten_pc_get_function.ret;
  };
  var getHeapMax = () => 2147483648;
  var growMemory = (size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
      wasmMemory.grow(pages);
      updateMemoryViews();
      return 1;
    } catch (e) {
    }
  };
  var _emscripten_resize_heap = (requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
      return false;
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
      var replacement = growMemory(newSize);
      if (replacement) {
        return true;
      }
    }
    return false;
  };
  var _emscripten_stack_unwind_buffer = (addr, buffer, count) => {
    var stack;
    if (UNWIND_CACHE.last_addr == addr) {
      stack = UNWIND_CACHE.last_stack;
    } else {
      stack = jsStackTrace().split("\n");
      if (stack[0] == "Error") {
        stack.shift();
      }
      saveInUnwindCache(stack);
    }
    var offset = 3;
    while (stack[offset] && convertFrameToPC(stack[offset]) != addr) {
      ++offset;
    }
    for (var i = 0; i < count && stack[i + offset]; ++i) {
      HEAP32[buffer + i * 4 >> 2] = convertFrameToPC(stack[i + offset]);
    }
    return i;
  };
  var ENV = {};
  var getExecutableName = () => thisProgram || "./this.program";
  var getEnvStrings = () => {
    if (!getEnvStrings.strings) {
      var lang = (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8";
      var env = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: lang, _: getExecutableName() };
      for (var x in ENV) {
        if (ENV[x] === void 0) delete env[x];
        else env[x] = ENV[x];
      }
      var strings = [];
      for (var x in env) {
        strings.push(`${x}=${env[x]}`);
      }
      getEnvStrings.strings = strings;
    }
    return getEnvStrings.strings;
  };
  var _environ_get = (__environ, environ_buf) => {
    var bufSize = 0;
    var envp = 0;
    for (var string of getEnvStrings()) {
      var ptr = environ_buf + bufSize;
      HEAPU32[__environ + envp >> 2] = ptr;
      bufSize += stringToUTF8(string, ptr, Infinity) + 1;
      envp += 4;
    }
    return 0;
  };
  var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
    var strings = getEnvStrings();
    HEAPU32[penviron_count >> 2] = strings.length;
    var bufSize = 0;
    for (var string of strings) {
      bufSize += lengthBytesUTF8(string) + 1;
    }
    HEAPU32[penviron_buf_size >> 2] = bufSize;
    return 0;
  };
  function _fd_close(fd) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.close(stream);
      return 0;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return e.errno;
    }
  }
  var doReadv = (stream, iov, iovcnt, offset) => {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[iov >> 2];
      var len = HEAPU32[iov + 4 >> 2];
      iov += 8;
      var curr = FS.read(stream, HEAP8, ptr, len, offset);
      if (curr < 0) return -1;
      ret += curr;
      if (curr < len) break;
      if (typeof offset != "undefined") {
        offset += curr;
      }
    }
    return ret;
  };
  function _fd_read(fd, iov, iovcnt, pnum) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doReadv(stream, iov, iovcnt);
      HEAPU32[pnum >> 2] = num;
      return 0;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return e.errno;
    }
  }
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
    try {
      if (isNaN(offset)) return 61;
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.llseek(stream, offset, whence);
      HEAP64[newOffset >> 3] = BigInt(stream.position);
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
      return 0;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return e.errno;
    }
  }
  var doWritev = (stream, iov, iovcnt, offset) => {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAPU32[iov >> 2];
      var len = HEAPU32[iov + 4 >> 2];
      iov += 8;
      var curr = FS.write(stream, HEAP8, ptr, len, offset);
      if (curr < 0) return -1;
      ret += curr;
      if (curr < len) {
        break;
      }
      if (typeof offset != "undefined") {
        offset += curr;
      }
    }
    return ret;
  };
  function _fd_write(fd, iov, iovcnt, pnum) {
    try {
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doWritev(stream, iov, iovcnt);
      HEAPU32[pnum >> 2] = num;
      return 0;
    } catch (e) {
      if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
      return e.errno;
    }
  }
  var _random_get = (buffer, size) => randomFill(HEAPU8.subarray(buffer, buffer + size));
  var getCFunc = (ident) => {
    var func = Module["_" + ident];
    return func;
  };
  var writeArrayToMemory = (array, buffer) => {
    HEAP8.set(array, buffer);
  };
  var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  var stringToUTF8OnStack = (str) => {
    var size = lengthBytesUTF8(str) + 1;
    var ret = stackAlloc(size);
    stringToUTF8(str, ret, size);
    return ret;
  };
  var ccall = (ident, returnType, argTypes, args, opts) => {
    var toC = { string: (str) => {
      var ret2 = 0;
      if (str !== null && str !== void 0 && str !== 0) {
        ret2 = stringToUTF8OnStack(str);
      }
      return ret2;
    }, array: (arr) => {
      var ret2 = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret2);
      return ret2;
    } };
    function convertReturnValue(ret2) {
      if (returnType === "string") {
        return UTF8ToString(ret2);
      }
      if (returnType === "boolean") return Boolean(ret2);
      return ret2;
    }
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func(...cArgs);
    function onDone(ret2) {
      if (stack !== 0) stackRestore(stack);
      return convertReturnValue(ret2);
    }
    ret = onDone(ret);
    return ret;
  };
  var cwrap = (ident, returnType, argTypes, opts) => {
    var numericArgs = !argTypes || argTypes.every((type) => type === "number" || type === "boolean");
    var numericRet = returnType !== "string";
    if (numericRet && numericArgs && !opts) {
      return getCFunc(ident);
    }
    return (...args) => ccall(ident, returnType, argTypes, args, opts);
  };
  FS.createPreloadedFile = FS_createPreloadedFile;
  FS.preloadFile = FS_preloadFile;
  FS.staticInit();
  {
    if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
    if (Module["preloadPlugins"]) preloadPlugins = Module["preloadPlugins"];
    if (Module["print"]) out = Module["print"];
    if (Module["printErr"]) err = Module["printErr"];
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].shift()();
      }
    }
  }
  Module["ccall"] = ccall;
  Module["cwrap"] = cwrap;
  var ASM_CONSTS = { 387332: () => typeof wasmOffsetConverter !== "undefined" };
  function cpsat_emit_solution(bytes, len) {
    Module["__cpsatOnSolution"](HEAPU8.slice(bytes, bytes + len));
  }
  function HaveOffsetConverter() {
    return typeof wasmOffsetConverter !== "undefined";
  }
  var _solve, _free, _malloc, _get_result_ptr, _free_result, _solution_count, _solution_ptr, _solution_len, _emscripten_builtin_memalign, __emscripten_timeout, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, memory, __indirect_function_table, wasmMemory, wasmTable;
  function assignWasmExports(wasmExports2) {
    _solve = Module["_solve"] = wasmExports2["G"];
    _free = Module["_free"] = wasmExports2["H"];
    _malloc = Module["_malloc"] = wasmExports2["J"];
    _get_result_ptr = Module["_get_result_ptr"] = wasmExports2["K"];
    _free_result = Module["_free_result"] = wasmExports2["L"];
    _solution_count = Module["_solution_count"] = wasmExports2["M"];
    _solution_ptr = Module["_solution_ptr"] = wasmExports2["N"];
    _solution_len = Module["_solution_len"] = wasmExports2["O"];
    _emscripten_builtin_memalign = wasmExports2["P"];
    __emscripten_timeout = wasmExports2["Q"];
    __emscripten_stack_restore = wasmExports2["R"];
    __emscripten_stack_alloc = wasmExports2["S"];
    _emscripten_stack_get_current = wasmExports2["T"];
    memory = wasmMemory = wasmExports2["E"];
    __indirect_function_table = wasmTable = wasmExports2["I"];
  }
  var wasmImports = { k: HaveOffsetConverter, r: ___call_sighandler, b: ___cxa_throw, h: ___syscall_fcntl64, z: ___syscall_ioctl, g: ___syscall_openat, q: ___syscall_stat64, B: __abort_js, s: __emscripten_runtime_keepalive_clear, t: __munmap_js, o: __setitimer_js, i: __tzset_js, A: _clock_time_get, D: cpsat_emit_solution, l: _emscripten_asm_const_int, e: _emscripten_errn, a: _emscripten_get_now, j: _emscripten_pc_get_function, p: _emscripten_resize_heap, n: _emscripten_stack_snapshot, m: _emscripten_stack_unwind_buffer, v: _environ_get, w: _environ_sizes_get, c: _exit, d: _fd_close, f: _fd_read, u: _fd_seek, y: _fd_write, C: _proc_exit, x: _random_get };
  function run() {
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    preRun();
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    function doRun() {
      Module["calledRun"] = true;
      if (ABORT) return;
      initRuntime();
      readyPromiseResolve?.(Module);
      Module["onRuntimeInitialized"]?.();
      postRun();
    }
    if (Module["setStatus"]) {
      Module["setStatus"]("Running...");
      setTimeout(() => {
        setTimeout(() => Module["setStatus"](""), 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  var wasmExports;
  wasmExports = await createWasm();
  run();
  if (runtimeInitialized) {
    moduleRtn = Module;
  } else {
    moduleRtn = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
  }
  ;
  return moduleRtn;
}
var cpsat_default;
var init_cpsat = __esm({
  "vendor/cpsat-js/build/portable/cpsat.mjs"() {
    cpsat_default = createCpSatModule;
  }
});

// node_modules/@bufbuild/protobuf/dist/esm/is-message.js
function isMessage(arg, schema) {
  const isMessage2 = arg !== null && typeof arg == "object" && "$typeName" in arg && typeof arg.$typeName == "string";
  if (!isMessage2) {
    return false;
  }
  if (schema === void 0) {
    return true;
  }
  return schema.typeName === arg.$typeName;
}

// node_modules/@bufbuild/protobuf/dist/esm/descriptors.js
var ScalarType;
(function(ScalarType2) {
  ScalarType2[ScalarType2["DOUBLE"] = 1] = "DOUBLE";
  ScalarType2[ScalarType2["FLOAT"] = 2] = "FLOAT";
  ScalarType2[ScalarType2["INT64"] = 3] = "INT64";
  ScalarType2[ScalarType2["UINT64"] = 4] = "UINT64";
  ScalarType2[ScalarType2["INT32"] = 5] = "INT32";
  ScalarType2[ScalarType2["FIXED64"] = 6] = "FIXED64";
  ScalarType2[ScalarType2["FIXED32"] = 7] = "FIXED32";
  ScalarType2[ScalarType2["BOOL"] = 8] = "BOOL";
  ScalarType2[ScalarType2["STRING"] = 9] = "STRING";
  ScalarType2[ScalarType2["BYTES"] = 12] = "BYTES";
  ScalarType2[ScalarType2["UINT32"] = 13] = "UINT32";
  ScalarType2[ScalarType2["SFIXED32"] = 15] = "SFIXED32";
  ScalarType2[ScalarType2["SFIXED64"] = 16] = "SFIXED64";
  ScalarType2[ScalarType2["SINT32"] = 17] = "SINT32";
  ScalarType2[ScalarType2["SINT64"] = 18] = "SINT64";
})(ScalarType || (ScalarType = {}));

// node_modules/@bufbuild/protobuf/dist/esm/wire/varint.js
function varint64read() {
  let lowBits = 0;
  let highBits = 0;
  for (let shift = 0; shift < 28; shift += 7) {
    let b = this.buf[this.pos++];
    lowBits |= (b & 127) << shift;
    if ((b & 128) == 0) {
      this.assertBounds();
      return [lowBits, highBits];
    }
  }
  let middleByte = this.buf[this.pos++];
  lowBits |= (middleByte & 15) << 28;
  highBits = (middleByte & 112) >> 4;
  if ((middleByte & 128) == 0) {
    this.assertBounds();
    return [lowBits, highBits];
  }
  for (let shift = 3; shift <= 31; shift += 7) {
    let b = this.buf[this.pos++];
    highBits |= (b & 127) << shift;
    if ((b & 128) == 0) {
      this.assertBounds();
      return [lowBits, highBits];
    }
  }
  throw new Error("invalid varint");
}
function varint64write(lo, hi, bytes) {
  for (let i = 0; i < 28; i = i + 7) {
    const shift = lo >>> i;
    const hasNext = !(shift >>> 7 == 0 && hi == 0);
    const byte = (hasNext ? shift | 128 : shift) & 255;
    bytes.push(byte);
    if (!hasNext) {
      return;
    }
  }
  const splitBits = lo >>> 28 & 15 | (hi & 7) << 4;
  const hasMoreBits = !(hi >> 3 == 0);
  bytes.push((hasMoreBits ? splitBits | 128 : splitBits) & 255);
  if (!hasMoreBits) {
    return;
  }
  for (let i = 3; i < 31; i = i + 7) {
    const shift = hi >>> i;
    const hasNext = !(shift >>> 7 == 0);
    const byte = (hasNext ? shift | 128 : shift) & 255;
    bytes.push(byte);
    if (!hasNext) {
      return;
    }
  }
  bytes.push(hi >>> 31 & 1);
}
var TWO_PWR_32_DBL = 4294967296;
function int64FromString(dec) {
  const minus = dec[0] === "-";
  if (minus) {
    dec = dec.slice(1);
  }
  const base = 1e6;
  let lowBits = 0;
  let highBits = 0;
  function add1e6digit(begin, end) {
    const digit1e6 = Number(dec.slice(begin, end));
    highBits *= base;
    lowBits = lowBits * base + digit1e6;
    if (lowBits >= TWO_PWR_32_DBL) {
      highBits = highBits + (lowBits / TWO_PWR_32_DBL | 0);
      lowBits = lowBits % TWO_PWR_32_DBL;
    }
  }
  add1e6digit(-24, -18);
  add1e6digit(-18, -12);
  add1e6digit(-12, -6);
  add1e6digit(-6);
  return minus ? negate(lowBits, highBits) : newBits(lowBits, highBits);
}
function int64ToString(lo, hi) {
  let bits = newBits(lo, hi);
  const negative = bits.hi & 2147483648;
  if (negative) {
    bits = negate(bits.lo, bits.hi);
  }
  const result = uInt64ToString(bits.lo, bits.hi);
  return negative ? "-" + result : result;
}
function uInt64ToString(lo, hi) {
  ({ lo, hi } = toUnsigned(lo, hi));
  if (hi <= 2097151) {
    return String(TWO_PWR_32_DBL * hi + lo);
  }
  const low = lo & 16777215;
  const mid = (lo >>> 24 | hi << 8) & 16777215;
  const high = hi >> 16 & 65535;
  let digitA = low + mid * 6777216 + high * 6710656;
  let digitB = mid + high * 8147497;
  let digitC = high * 2;
  const base = 1e7;
  if (digitA >= base) {
    digitB += Math.floor(digitA / base);
    digitA %= base;
  }
  if (digitB >= base) {
    digitC += Math.floor(digitB / base);
    digitB %= base;
  }
  return digitC.toString() + decimalFrom1e7WithLeadingZeros(digitB) + decimalFrom1e7WithLeadingZeros(digitA);
}
function toUnsigned(lo, hi) {
  return { lo: lo >>> 0, hi: hi >>> 0 };
}
function newBits(lo, hi) {
  return { lo: lo | 0, hi: hi | 0 };
}
function negate(lowBits, highBits) {
  highBits = ~highBits;
  if (lowBits) {
    lowBits = ~lowBits + 1;
  } else {
    highBits += 1;
  }
  return newBits(lowBits, highBits);
}
var decimalFrom1e7WithLeadingZeros = (digit1e7) => {
  const partial = String(digit1e7);
  return "0000000".slice(partial.length) + partial;
};
function varint32write(value, bytes) {
  if (value >= 0) {
    while (value > 127) {
      bytes.push(value & 127 | 128);
      value = value >>> 7;
    }
    bytes.push(value);
  } else {
    for (let i = 0; i < 9; i++) {
      bytes.push(value & 127 | 128);
      value = value >> 7;
    }
    bytes.push(1);
  }
}
function varint32read() {
  let b = this.buf[this.pos++];
  let result = b & 127;
  if ((b & 128) == 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 127) << 7;
  if ((b & 128) == 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 127) << 14;
  if ((b & 128) == 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 127) << 21;
  if ((b & 128) == 0) {
    this.assertBounds();
    return result;
  }
  b = this.buf[this.pos++];
  result |= (b & 15) << 28;
  for (let readBytes = 5; (b & 128) !== 0 && readBytes < 10; readBytes++)
    b = this.buf[this.pos++];
  if ((b & 128) != 0)
    throw new Error("invalid varint");
  this.assertBounds();
  return result >>> 0;
}

// node_modules/@bufbuild/protobuf/dist/esm/proto-int64.js
var protoInt64 = /* @__PURE__ */ makeInt64Support();
function makeInt64Support() {
  const dv = new DataView(new ArrayBuffer(8));
  const ok = typeof BigInt === "function" && typeof dv.getBigInt64 === "function" && typeof dv.getBigUint64 === "function" && typeof dv.setBigInt64 === "function" && typeof dv.setBigUint64 === "function" && (!!globalThis.Deno || typeof process != "object" || typeof process.env != "object" || process.env.BUF_BIGINT_DISABLE !== "1");
  if (ok) {
    const MIN = BigInt("-9223372036854775808");
    const MAX = BigInt("9223372036854775807");
    const UMIN = BigInt("0");
    const UMAX = BigInt("18446744073709551615");
    return {
      zero: BigInt(0),
      supported: true,
      parse(value) {
        const bi = typeof value == "bigint" ? value : BigInt(value);
        if (bi > MAX || bi < MIN) {
          throw new Error(`invalid int64: ${value}`);
        }
        return bi;
      },
      uParse(value) {
        const bi = typeof value == "bigint" ? value : BigInt(value);
        if (bi > UMAX || bi < UMIN) {
          throw new Error(`invalid uint64: ${value}`);
        }
        return bi;
      },
      enc(value) {
        dv.setBigInt64(0, this.parse(value), true);
        return {
          lo: dv.getInt32(0, true),
          hi: dv.getInt32(4, true)
        };
      },
      uEnc(value) {
        dv.setBigInt64(0, this.uParse(value), true);
        return {
          lo: dv.getInt32(0, true),
          hi: dv.getInt32(4, true)
        };
      },
      dec(lo, hi) {
        dv.setInt32(0, lo, true);
        dv.setInt32(4, hi, true);
        return dv.getBigInt64(0, true);
      },
      uDec(lo, hi) {
        dv.setInt32(0, lo, true);
        dv.setInt32(4, hi, true);
        return dv.getBigUint64(0, true);
      }
    };
  }
  return {
    zero: "0",
    supported: false,
    parse(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertInt64String(value);
      return value;
    },
    uParse(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertUInt64String(value);
      return value;
    },
    enc(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertInt64String(value);
      return int64FromString(value);
    },
    uEnc(value) {
      if (typeof value != "string") {
        value = value.toString();
      }
      assertUInt64String(value);
      return int64FromString(value);
    },
    dec(lo, hi) {
      return int64ToString(lo, hi);
    },
    uDec(lo, hi) {
      return uInt64ToString(lo, hi);
    }
  };
}
function assertInt64String(value) {
  if (!/^-?[0-9]+$/.test(value)) {
    throw new Error("invalid int64: " + value);
  }
}
function assertUInt64String(value) {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("invalid uint64: " + value);
  }
}

// node_modules/@bufbuild/protobuf/dist/esm/reflect/scalar.js
function scalarZeroValue(type, longAsString) {
  switch (type) {
    case ScalarType.STRING:
      return "";
    case ScalarType.BOOL:
      return false;
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      return 0;
    case ScalarType.INT64:
    case ScalarType.UINT64:
    case ScalarType.SFIXED64:
    case ScalarType.FIXED64:
    case ScalarType.SINT64:
      return longAsString ? "0" : protoInt64.zero;
    case ScalarType.BYTES:
      return new Uint8Array(0);
    default:
      return 0;
  }
}
function isScalarZeroValue(type, value) {
  switch (type) {
    case ScalarType.BOOL:
      return value === false;
    case ScalarType.STRING:
      return value === "";
    case ScalarType.BYTES:
      return value instanceof Uint8Array && !value.byteLength;
    default:
      return value == 0;
  }
}

// node_modules/@bufbuild/protobuf/dist/esm/reflect/unsafe.js
var IMPLICIT = 2;
var unsafeLocal = Symbol.for("reflect unsafe local");
function unsafeOneofCase(target, oneof) {
  const c = target[oneof.localName].case;
  if (c === void 0) {
    return c;
  }
  return oneof.fields.find((f) => f.localName === c);
}
function unsafeIsSet(target, field) {
  const name = field.localName;
  if (field.oneof) {
    return target[field.oneof.localName].case === name;
  }
  if (field.presence != IMPLICIT) {
    return target[name] !== void 0 && Object.prototype.hasOwnProperty.call(target, name);
  }
  switch (field.fieldKind) {
    case "list":
      return target[name].length > 0;
    case "map":
      return Object.keys(target[name]).length > 0;
    case "scalar":
      return !isScalarZeroValue(field.scalar, target[name]);
    case "enum":
      return target[name] !== field.enum.values[0].number;
  }
  throw new Error("message field with implicit presence");
}
function unsafeIsSetExplicit(target, localName) {
  return Object.prototype.hasOwnProperty.call(target, localName) && target[localName] !== void 0;
}
function unsafeGet(target, field) {
  if (field.oneof) {
    const oneof = target[field.oneof.localName];
    if (oneof.case === field.localName) {
      return oneof.value;
    }
    return void 0;
  }
  return target[field.localName];
}
function unsafeSet(target, field, value) {
  if (field.oneof) {
    target[field.oneof.localName] = {
      case: field.localName,
      value
    };
  } else {
    target[field.localName] = value;
  }
}
function unsafeClear(target, field) {
  const name = field.localName;
  if (field.oneof) {
    const oneofLocalName = field.oneof.localName;
    if (target[oneofLocalName].case === name) {
      target[oneofLocalName] = { case: void 0 };
    }
  } else if (field.presence != IMPLICIT) {
    delete target[name];
  } else {
    switch (field.fieldKind) {
      case "map":
        target[name] = {};
        break;
      case "list":
        target[name] = [];
        break;
      case "enum":
        target[name] = field.enum.values[0].number;
        break;
      case "scalar":
        target[name] = scalarZeroValue(field.scalar, field.longAsString);
        break;
    }
  }
}

// node_modules/@bufbuild/protobuf/dist/esm/reflect/guard.js
function isObject(arg) {
  return arg !== null && typeof arg == "object" && !Array.isArray(arg);
}
function isReflectList(arg, field) {
  var _a, _b, _c, _d;
  if (isObject(arg) && unsafeLocal in arg && "add" in arg && "field" in arg && typeof arg.field == "function") {
    if (field !== void 0) {
      const a = field;
      const b = arg.field();
      return a.listKind == b.listKind && a.scalar === b.scalar && ((_a = a.message) === null || _a === void 0 ? void 0 : _a.typeName) === ((_b = b.message) === null || _b === void 0 ? void 0 : _b.typeName) && ((_c = a.enum) === null || _c === void 0 ? void 0 : _c.typeName) === ((_d = b.enum) === null || _d === void 0 ? void 0 : _d.typeName);
    }
    return true;
  }
  return false;
}
function isReflectMap(arg, field) {
  var _a, _b, _c, _d;
  if (isObject(arg) && unsafeLocal in arg && "has" in arg && "field" in arg && typeof arg.field == "function") {
    if (field !== void 0) {
      const a = field, b = arg.field();
      return a.mapKey === b.mapKey && a.mapKind == b.mapKind && a.scalar === b.scalar && ((_a = a.message) === null || _a === void 0 ? void 0 : _a.typeName) === ((_b = b.message) === null || _b === void 0 ? void 0 : _b.typeName) && ((_c = a.enum) === null || _c === void 0 ? void 0 : _c.typeName) === ((_d = b.enum) === null || _d === void 0 ? void 0 : _d.typeName);
    }
    return true;
  }
  return false;
}
function isReflectMessage(arg, messageDesc2) {
  return isObject(arg) && unsafeLocal in arg && "desc" in arg && isObject(arg.desc) && arg.desc.kind === "message" && (messageDesc2 === void 0 || arg.desc.typeName == messageDesc2.typeName);
}

// node_modules/@bufbuild/protobuf/dist/esm/wkt/wrappers.js
function isWrapper(arg) {
  return isWrapperTypeName(arg.$typeName);
}
function isWrapperDesc(messageDesc2) {
  const f = messageDesc2.fields[0];
  return isWrapperTypeName(messageDesc2.typeName) && f !== void 0 && f.fieldKind == "scalar" && f.name == "value" && f.number == 1;
}
function isWrapperTypeName(name) {
  return name.startsWith("google.protobuf.") && [
    "DoubleValue",
    "FloatValue",
    "Int64Value",
    "UInt64Value",
    "Int32Value",
    "UInt32Value",
    "BoolValue",
    "StringValue",
    "BytesValue"
  ].includes(name.substring(16));
}

// node_modules/@bufbuild/protobuf/dist/esm/create.js
var EDITION_PROTO3 = 999;
var EDITION_PROTO2 = 998;
var IMPLICIT2 = 2;
function create(schema, init) {
  if (isMessage(init, schema)) {
    return init;
  }
  const message = createZeroMessage(schema);
  if (init !== void 0) {
    initMessage(schema, message, init);
  }
  return message;
}
function initMessage(messageDesc2, message, init) {
  for (const member of messageDesc2.members) {
    let value = init[member.localName];
    if (value == null) {
      continue;
    }
    let field;
    if (member.kind == "oneof") {
      const oneofField = unsafeOneofCase(init, member);
      if (!oneofField) {
        continue;
      }
      field = oneofField;
      value = unsafeGet(init, oneofField);
    } else {
      field = member;
    }
    switch (field.fieldKind) {
      case "message":
        value = toMessage(field, value);
        break;
      case "scalar":
        value = initScalar(field, value);
        break;
      case "list":
        value = initList(field, value);
        break;
      case "map":
        value = initMap(field, value);
        break;
    }
    unsafeSet(message, field, value);
  }
  return message;
}
function initScalar(field, value) {
  if (field.scalar == ScalarType.BYTES) {
    return toU8Arr(value);
  }
  return value;
}
function initMap(field, value) {
  if (isObject(value)) {
    if (field.scalar == ScalarType.BYTES) {
      return convertObjectValues(value, toU8Arr);
    }
    if (field.mapKind == "message") {
      return convertObjectValues(value, (val) => toMessage(field, val));
    }
  }
  return value;
}
function initList(field, value) {
  if (Array.isArray(value)) {
    if (field.scalar == ScalarType.BYTES) {
      return value.map(toU8Arr);
    }
    if (field.listKind == "message") {
      return value.map((item) => toMessage(field, item));
    }
  }
  return value;
}
function toMessage(field, value) {
  if (field.fieldKind == "message" && !field.oneof && isWrapperDesc(field.message)) {
    return initScalar(field.message.fields[0], value);
  }
  if (isObject(value)) {
    if (field.message.typeName == "google.protobuf.Struct" && field.parent.typeName !== "google.protobuf.Value") {
      return value;
    }
    if (!isMessage(value, field.message)) {
      return create(field.message, value);
    }
  }
  return value;
}
function toU8Arr(value) {
  return Array.isArray(value) ? new Uint8Array(value) : value;
}
function convertObjectValues(obj, fn) {
  const ret = {};
  for (const entry of Object.entries(obj)) {
    ret[entry[0]] = fn(entry[1]);
  }
  return ret;
}
var tokenZeroMessageField = Symbol();
var messagePrototypes = /* @__PURE__ */ new WeakMap();
function createZeroMessage(desc) {
  let msg;
  if (!needsPrototypeChain(desc)) {
    msg = {
      $typeName: desc.typeName
    };
    for (const member of desc.members) {
      if (member.kind == "oneof" || member.presence == IMPLICIT2) {
        msg[member.localName] = createZeroField(member);
      }
    }
  } else {
    const cached = messagePrototypes.get(desc);
    let prototype;
    let members;
    if (cached) {
      ({ prototype, members } = cached);
    } else {
      prototype = {};
      members = /* @__PURE__ */ new Set();
      for (const member of desc.members) {
        if (member.kind == "oneof") {
          continue;
        }
        if (member.fieldKind != "scalar" && member.fieldKind != "enum") {
          continue;
        }
        if (member.presence == IMPLICIT2) {
          continue;
        }
        members.add(member);
        prototype[member.localName] = createZeroField(member);
      }
      messagePrototypes.set(desc, { prototype, members });
    }
    msg = Object.create(prototype);
    msg.$typeName = desc.typeName;
    for (const member of desc.members) {
      if (members.has(member)) {
        continue;
      }
      if (member.kind == "field") {
        if (member.fieldKind == "message") {
          continue;
        }
        if (member.fieldKind == "scalar" || member.fieldKind == "enum") {
          if (member.presence != IMPLICIT2) {
            continue;
          }
        }
      }
      msg[member.localName] = createZeroField(member);
    }
  }
  return msg;
}
function needsPrototypeChain(desc) {
  switch (desc.file.edition) {
    case EDITION_PROTO3:
      return false;
    case EDITION_PROTO2:
      return true;
    default:
      return desc.fields.some((f) => f.presence != IMPLICIT2 && f.fieldKind != "message" && !f.oneof);
  }
}
function createZeroField(field) {
  if (field.kind == "oneof") {
    return { case: void 0 };
  }
  if (field.fieldKind == "list") {
    return [];
  }
  if (field.fieldKind == "map") {
    return {};
  }
  if (field.fieldKind == "message") {
    return tokenZeroMessageField;
  }
  const defaultValue = field.getDefaultValue();
  if (defaultValue !== void 0) {
    return field.fieldKind == "scalar" && field.longAsString ? defaultValue.toString() : defaultValue;
  }
  return field.fieldKind == "scalar" ? scalarZeroValue(field.scalar, field.longAsString) : field.enum.values[0].number;
}

// node_modules/@bufbuild/protobuf/dist/esm/reflect/error.js
var FieldError = class extends Error {
  constructor(fieldOrOneof, message, name = "FieldValueInvalidError") {
    super(message);
    this.name = name;
    this.field = () => fieldOrOneof;
  }
};

// node_modules/@bufbuild/protobuf/dist/esm/wire/text-encoding.js
var symbol = Symbol.for("@bufbuild/protobuf/text-encoding");
function getTextEncoding() {
  if (globalThis[symbol] == void 0) {
    const te = new globalThis.TextEncoder();
    const td = new globalThis.TextDecoder();
    globalThis[symbol] = {
      encodeUtf8(text) {
        return te.encode(text);
      },
      decodeUtf8(bytes) {
        return td.decode(bytes);
      },
      checkUtf8(text) {
        try {
          encodeURIComponent(text);
          return true;
        } catch (_) {
          return false;
        }
      }
    };
  }
  return globalThis[symbol];
}

// node_modules/@bufbuild/protobuf/dist/esm/wire/binary-encoding.js
var WireType;
(function(WireType2) {
  WireType2[WireType2["Varint"] = 0] = "Varint";
  WireType2[WireType2["Bit64"] = 1] = "Bit64";
  WireType2[WireType2["LengthDelimited"] = 2] = "LengthDelimited";
  WireType2[WireType2["StartGroup"] = 3] = "StartGroup";
  WireType2[WireType2["EndGroup"] = 4] = "EndGroup";
  WireType2[WireType2["Bit32"] = 5] = "Bit32";
})(WireType || (WireType = {}));
var FLOAT32_MAX = 34028234663852886e22;
var FLOAT32_MIN = -34028234663852886e22;
var UINT32_MAX = 4294967295;
var INT32_MAX = 2147483647;
var INT32_MIN = -2147483648;
var BinaryWriter = class {
  constructor(encodeUtf8 = getTextEncoding().encodeUtf8) {
    this.encodeUtf8 = encodeUtf8;
    this.stack = [];
    this.chunks = [];
    this.buf = [];
  }
  /**
   * Return all bytes written and reset this writer.
   */
  finish() {
    if (this.buf.length) {
      this.chunks.push(new Uint8Array(this.buf));
      this.buf = [];
    }
    let len = 0;
    for (let i = 0; i < this.chunks.length; i++)
      len += this.chunks[i].length;
    let bytes = new Uint8Array(len);
    let offset = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      bytes.set(this.chunks[i], offset);
      offset += this.chunks[i].length;
    }
    this.chunks = [];
    return bytes;
  }
  /**
   * Start a new fork for length-delimited data like a message
   * or a packed repeated field.
   *
   * Must be joined later with `join()`.
   */
  fork() {
    this.stack.push({ chunks: this.chunks, buf: this.buf });
    this.chunks = [];
    this.buf = [];
    return this;
  }
  /**
   * Join the last fork. Write its length and bytes, then
   * return to the previous state.
   */
  join() {
    let chunk = this.finish();
    let prev = this.stack.pop();
    if (!prev)
      throw new Error("invalid state, fork stack empty");
    this.chunks = prev.chunks;
    this.buf = prev.buf;
    this.uint32(chunk.byteLength);
    return this.raw(chunk);
  }
  /**
   * Writes a tag (field number and wire type).
   *
   * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
   *
   * Generated code should compute the tag ahead of time and call `uint32()`.
   */
  tag(fieldNo, type) {
    return this.uint32((fieldNo << 3 | type) >>> 0);
  }
  /**
   * Write a chunk of raw bytes.
   */
  raw(chunk) {
    if (this.buf.length) {
      this.chunks.push(new Uint8Array(this.buf));
      this.buf = [];
    }
    this.chunks.push(chunk);
    return this;
  }
  /**
   * Write a `uint32` value, an unsigned 32 bit varint.
   */
  uint32(value) {
    assertUInt32(value);
    while (value > 127) {
      this.buf.push(value & 127 | 128);
      value = value >>> 7;
    }
    this.buf.push(value);
    return this;
  }
  /**
   * Write a `int32` value, a signed 32 bit varint.
   */
  int32(value) {
    assertInt32(value);
    varint32write(value, this.buf);
    return this;
  }
  /**
   * Write a `bool` value, a variant.
   */
  bool(value) {
    this.buf.push(value ? 1 : 0);
    return this;
  }
  /**
   * Write a `bytes` value, length-delimited arbitrary data.
   */
  bytes(value) {
    this.uint32(value.byteLength);
    return this.raw(value);
  }
  /**
   * Write a `string` value, length-delimited data converted to UTF-8 text.
   */
  string(value) {
    let chunk = this.encodeUtf8(value);
    this.uint32(chunk.byteLength);
    return this.raw(chunk);
  }
  /**
   * Write a `float` value, 32-bit floating point number.
   */
  float(value) {
    assertFloat32(value);
    let chunk = new Uint8Array(4);
    new DataView(chunk.buffer).setFloat32(0, value, true);
    return this.raw(chunk);
  }
  /**
   * Write a `double` value, a 64-bit floating point number.
   */
  double(value) {
    let chunk = new Uint8Array(8);
    new DataView(chunk.buffer).setFloat64(0, value, true);
    return this.raw(chunk);
  }
  /**
   * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
   */
  fixed32(value) {
    assertUInt32(value);
    let chunk = new Uint8Array(4);
    new DataView(chunk.buffer).setUint32(0, value, true);
    return this.raw(chunk);
  }
  /**
   * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
   */
  sfixed32(value) {
    assertInt32(value);
    let chunk = new Uint8Array(4);
    new DataView(chunk.buffer).setInt32(0, value, true);
    return this.raw(chunk);
  }
  /**
   * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
   */
  sint32(value) {
    assertInt32(value);
    value = (value << 1 ^ value >> 31) >>> 0;
    varint32write(value, this.buf);
    return this;
  }
  /**
   * Write a `fixed64` value, a signed, fixed-length 64-bit integer.
   */
  sfixed64(value) {
    let chunk = new Uint8Array(8), view = new DataView(chunk.buffer), tc = protoInt64.enc(value);
    view.setInt32(0, tc.lo, true);
    view.setInt32(4, tc.hi, true);
    return this.raw(chunk);
  }
  /**
   * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
   */
  fixed64(value) {
    let chunk = new Uint8Array(8), view = new DataView(chunk.buffer), tc = protoInt64.uEnc(value);
    view.setInt32(0, tc.lo, true);
    view.setInt32(4, tc.hi, true);
    return this.raw(chunk);
  }
  /**
   * Write a `int64` value, a signed 64-bit varint.
   */
  int64(value) {
    let tc = protoInt64.enc(value);
    varint64write(tc.lo, tc.hi, this.buf);
    return this;
  }
  /**
   * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
   */
  sint64(value) {
    const tc = protoInt64.enc(value), sign = tc.hi >> 31, lo = tc.lo << 1 ^ sign, hi = (tc.hi << 1 | tc.lo >>> 31) ^ sign;
    varint64write(lo, hi, this.buf);
    return this;
  }
  /**
   * Write a `uint64` value, an unsigned 64-bit varint.
   */
  uint64(value) {
    const tc = protoInt64.uEnc(value);
    varint64write(tc.lo, tc.hi, this.buf);
    return this;
  }
};
var BinaryReader = class {
  constructor(buf, decodeUtf8 = getTextEncoding().decodeUtf8) {
    this.decodeUtf8 = decodeUtf8;
    this.varint64 = varint64read;
    this.uint32 = varint32read;
    this.buf = buf;
    this.len = buf.length;
    this.pos = 0;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  /**
   * Reads a tag - field number and wire type.
   */
  tag() {
    let tag = this.uint32(), fieldNo = tag >>> 3, wireType = tag & 7;
    if (fieldNo <= 0 || wireType < 0 || wireType > 5)
      throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
    return [fieldNo, wireType];
  }
  /**
   * Skip one element and return the skipped data.
   *
   * When skipping StartGroup, provide the tags field number to check for
   * matching field number in the EndGroup tag.
   */
  skip(wireType, fieldNo) {
    let start = this.pos;
    switch (wireType) {
      case WireType.Varint:
        while (this.buf[this.pos++] & 128) {
        }
        break;
      // @ts-ignore TS7029: Fallthrough case in switch -- ignore instead of expect-error for compiler settings without noFallthroughCasesInSwitch: true
      case WireType.Bit64:
        this.pos += 4;
      case WireType.Bit32:
        this.pos += 4;
        break;
      case WireType.LengthDelimited:
        let len = this.uint32();
        this.pos += len;
        break;
      case WireType.StartGroup:
        for (; ; ) {
          const [fn, wt] = this.tag();
          if (wt === WireType.EndGroup) {
            if (fieldNo !== void 0 && fn !== fieldNo) {
              throw new Error("invalid end group tag");
            }
            break;
          }
          this.skip(wt, fn);
        }
        break;
      default:
        throw new Error("cant skip wire type " + wireType);
    }
    this.assertBounds();
    return this.buf.subarray(start, this.pos);
  }
  /**
   * Throws error if position in byte array is out of range.
   */
  assertBounds() {
    if (this.pos > this.len)
      throw new RangeError("premature EOF");
  }
  /**
   * Read a `int32` field, a signed 32 bit varint.
   */
  int32() {
    return this.uint32() | 0;
  }
  /**
   * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
   */
  sint32() {
    let zze = this.uint32();
    return zze >>> 1 ^ -(zze & 1);
  }
  /**
   * Read a `int64` field, a signed 64-bit varint.
   */
  int64() {
    return protoInt64.dec(...this.varint64());
  }
  /**
   * Read a `uint64` field, an unsigned 64-bit varint.
   */
  uint64() {
    return protoInt64.uDec(...this.varint64());
  }
  /**
   * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
   */
  sint64() {
    let [lo, hi] = this.varint64();
    let s = -(lo & 1);
    lo = (lo >>> 1 | (hi & 1) << 31) ^ s;
    hi = hi >>> 1 ^ s;
    return protoInt64.dec(lo, hi);
  }
  /**
   * Read a `bool` field, a variant.
   */
  bool() {
    let [lo, hi] = this.varint64();
    return lo !== 0 || hi !== 0;
  }
  /**
   * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
   */
  fixed32() {
    return this.view.getUint32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
   */
  sfixed32() {
    return this.view.getInt32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
   */
  fixed64() {
    return protoInt64.uDec(this.sfixed32(), this.sfixed32());
  }
  /**
   * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
   */
  sfixed64() {
    return protoInt64.dec(this.sfixed32(), this.sfixed32());
  }
  /**
   * Read a `float` field, 32-bit floating point number.
   */
  float() {
    return this.view.getFloat32((this.pos += 4) - 4, true);
  }
  /**
   * Read a `double` field, a 64-bit floating point number.
   */
  double() {
    return this.view.getFloat64((this.pos += 8) - 8, true);
  }
  /**
   * Read a `bytes` field, length-delimited arbitrary data.
   */
  bytes() {
    let len = this.uint32(), start = this.pos;
    this.pos += len;
    this.assertBounds();
    return this.buf.subarray(start, start + len);
  }
  /**
   * Read a `string` field, length-delimited data converted to UTF-8 text.
   */
  string() {
    return this.decodeUtf8(this.bytes());
  }
};
function assertInt32(arg) {
  if (typeof arg == "string") {
    arg = Number(arg);
  } else if (typeof arg != "number") {
    throw new Error("invalid int32: " + typeof arg);
  }
  if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN)
    throw new Error("invalid int32: " + arg);
}
function assertUInt32(arg) {
  if (typeof arg == "string") {
    arg = Number(arg);
  } else if (typeof arg != "number") {
    throw new Error("invalid uint32: " + typeof arg);
  }
  if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0)
    throw new Error("invalid uint32: " + arg);
}
function assertFloat32(arg) {
  if (typeof arg == "string") {
    const o = arg;
    arg = Number(arg);
    if (Number.isNaN(arg) && o !== "NaN") {
      throw new Error("invalid float32: " + o);
    }
  } else if (typeof arg != "number") {
    throw new Error("invalid float32: " + typeof arg);
  }
  if (Number.isFinite(arg) && (arg > FLOAT32_MAX || arg < FLOAT32_MIN))
    throw new Error("invalid float32: " + arg);
}

// node_modules/@bufbuild/protobuf/dist/esm/reflect/reflect-check.js
function checkField(field, value) {
  const check = field.fieldKind == "list" ? isReflectList(value, field) : field.fieldKind == "map" ? isReflectMap(value, field) : checkSingular(field, value);
  if (check === true) {
    return void 0;
  }
  let reason;
  switch (field.fieldKind) {
    case "list":
      reason = `expected ${formatReflectList(field)}, got ${formatVal(value)}`;
      break;
    case "map":
      reason = `expected ${formatReflectMap(field)}, got ${formatVal(value)}`;
      break;
    default: {
      reason = reasonSingular(field, value, check);
    }
  }
  return new FieldError(field, reason);
}
function checkListItem(field, index, value) {
  const check = checkSingular(field, value);
  if (check !== true) {
    return new FieldError(field, `list item #${index + 1}: ${reasonSingular(field, value, check)}`);
  }
  return void 0;
}
function checkMapEntry(field, key, value) {
  const checkKey = checkScalarValue(key, field.mapKey);
  if (checkKey !== true) {
    return new FieldError(field, `invalid map key: ${reasonSingular({ scalar: field.mapKey }, key, checkKey)}`);
  }
  const checkVal = checkSingular(field, value);
  if (checkVal !== true) {
    return new FieldError(field, `map entry ${formatVal(key)}: ${reasonSingular(field, value, checkVal)}`);
  }
  return void 0;
}
function checkSingular(field, value) {
  if (field.scalar !== void 0) {
    return checkScalarValue(value, field.scalar);
  }
  if (field.enum !== void 0) {
    if (field.enum.open) {
      return Number.isInteger(value);
    }
    return field.enum.values.some((v) => v.number === value);
  }
  return isReflectMessage(value, field.message);
}
function checkScalarValue(value, scalar) {
  switch (scalar) {
    case ScalarType.DOUBLE:
      return typeof value == "number";
    case ScalarType.FLOAT:
      if (typeof value != "number") {
        return false;
      }
      if (Number.isNaN(value) || !Number.isFinite(value)) {
        return true;
      }
      if (value > FLOAT32_MAX || value < FLOAT32_MIN) {
        return `${value.toFixed()} out of range`;
      }
      return true;
    case ScalarType.INT32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return false;
      }
      if (value > INT32_MAX || value < INT32_MIN) {
        return `${value.toFixed()} out of range`;
      }
      return true;
    case ScalarType.FIXED32:
    case ScalarType.UINT32:
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return false;
      }
      if (value > UINT32_MAX || value < 0) {
        return `${value.toFixed()} out of range`;
      }
      return true;
    case ScalarType.BOOL:
      return typeof value == "boolean";
    case ScalarType.STRING:
      if (typeof value != "string") {
        return false;
      }
      return getTextEncoding().checkUtf8(value) || "invalid UTF8";
    case ScalarType.BYTES:
      return value instanceof Uint8Array;
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      if (typeof value == "bigint" || typeof value == "number" || typeof value == "string" && value.length > 0) {
        try {
          protoInt64.parse(value);
          return true;
        } catch (_) {
          return `${value} out of range`;
        }
      }
      return false;
    case ScalarType.FIXED64:
    case ScalarType.UINT64:
      if (typeof value == "bigint" || typeof value == "number" || typeof value == "string" && value.length > 0) {
        try {
          protoInt64.uParse(value);
          return true;
        } catch (_) {
          return `${value} out of range`;
        }
      }
      return false;
  }
}
function reasonSingular(field, val, details) {
  details = typeof details == "string" ? `: ${details}` : `, got ${formatVal(val)}`;
  if (field.scalar !== void 0) {
    return `expected ${scalarTypeDescription(field.scalar)}` + details;
  }
  if (field.enum !== void 0) {
    return `expected ${field.enum.toString()}` + details;
  }
  return `expected ${formatReflectMessage(field.message)}` + details;
}
function formatVal(val) {
  switch (typeof val) {
    case "object":
      if (val === null) {
        return "null";
      }
      if (val instanceof Uint8Array) {
        return `Uint8Array(${val.length})`;
      }
      if (Array.isArray(val)) {
        return `Array(${val.length})`;
      }
      if (isReflectList(val)) {
        return formatReflectList(val.field());
      }
      if (isReflectMap(val)) {
        return formatReflectMap(val.field());
      }
      if (isReflectMessage(val)) {
        return formatReflectMessage(val.desc);
      }
      if (isMessage(val)) {
        return `message ${val.$typeName}`;
      }
      return "object";
    case "string":
      return val.length > 30 ? "string" : `"${val.split('"').join('\\"')}"`;
    case "boolean":
      return String(val);
    case "number":
      return String(val);
    case "bigint":
      return String(val) + "n";
    default:
      return typeof val;
  }
}
function formatReflectMessage(desc) {
  return `ReflectMessage (${desc.typeName})`;
}
function formatReflectList(field) {
  switch (field.listKind) {
    case "message":
      return `ReflectList (${field.message.toString()})`;
    case "enum":
      return `ReflectList (${field.enum.toString()})`;
    case "scalar":
      return `ReflectList (${ScalarType[field.scalar]})`;
  }
}
function formatReflectMap(field) {
  switch (field.mapKind) {
    case "message":
      return `ReflectMap (${ScalarType[field.mapKey]}, ${field.message.toString()})`;
    case "enum":
      return `ReflectMap (${ScalarType[field.mapKey]}, ${field.enum.toString()})`;
    case "scalar":
      return `ReflectMap (${ScalarType[field.mapKey]}, ${ScalarType[field.scalar]})`;
  }
}
function scalarTypeDescription(scalar) {
  switch (scalar) {
    case ScalarType.STRING:
      return "string";
    case ScalarType.BOOL:
      return "boolean";
    case ScalarType.INT64:
    case ScalarType.SINT64:
    case ScalarType.SFIXED64:
      return "bigint (int64)";
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
      return "bigint (uint64)";
    case ScalarType.BYTES:
      return "Uint8Array";
    case ScalarType.DOUBLE:
      return "number (float64)";
    case ScalarType.FLOAT:
      return "number (float32)";
    case ScalarType.FIXED32:
    case ScalarType.UINT32:
      return "number (uint32)";
    case ScalarType.INT32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32:
      return "number (int32)";
  }
}

// node_modules/@bufbuild/protobuf/dist/esm/reflect/reflect.js
function reflect(messageDesc2, message, check = true) {
  return new ReflectMessageImpl(messageDesc2, message, check);
}
var messageSortedFields = /* @__PURE__ */ new WeakMap();
var ReflectMessageImpl = class {
  get sortedFields() {
    const cached = messageSortedFields.get(this.desc);
    if (cached) {
      return cached;
    }
    const sortedFields = this.desc.fields.concat().sort((a, b) => a.number - b.number);
    messageSortedFields.set(this.desc, sortedFields);
    return sortedFields;
  }
  constructor(messageDesc2, message, check = true) {
    this.lists = /* @__PURE__ */ new Map();
    this.maps = /* @__PURE__ */ new Map();
    this.check = check;
    this.desc = messageDesc2;
    this.message = this[unsafeLocal] = message !== null && message !== void 0 ? message : create(messageDesc2);
    this.fields = messageDesc2.fields;
    this.oneofs = messageDesc2.oneofs;
    this.members = messageDesc2.members;
  }
  findNumber(number) {
    if (!this._fieldsByNumber) {
      this._fieldsByNumber = new Map(this.desc.fields.map((f) => [f.number, f]));
    }
    return this._fieldsByNumber.get(number);
  }
  oneofCase(oneof) {
    assertOwn(this.message, oneof);
    return unsafeOneofCase(this.message, oneof);
  }
  isSet(field) {
    assertOwn(this.message, field);
    return unsafeIsSet(this.message, field);
  }
  clear(field) {
    assertOwn(this.message, field);
    unsafeClear(this.message, field);
  }
  get(field) {
    assertOwn(this.message, field);
    const value = unsafeGet(this.message, field);
    switch (field.fieldKind) {
      case "list":
        let list = this.lists.get(field);
        if (!list || list[unsafeLocal] !== value) {
          this.lists.set(
            field,
            // biome-ignore lint/suspicious/noAssignInExpressions: no
            list = new ReflectListImpl(field, value, this.check)
          );
        }
        return list;
      case "map":
        let map = this.maps.get(field);
        if (!map || map[unsafeLocal] !== value) {
          this.maps.set(
            field,
            // biome-ignore lint/suspicious/noAssignInExpressions: no
            map = new ReflectMapImpl(field, value, this.check)
          );
        }
        return map;
      case "message":
        return messageToReflect(field, value, this.check);
      case "scalar":
        return value === void 0 ? scalarZeroValue(field.scalar, false) : longToReflect(field, value);
      case "enum":
        return value !== null && value !== void 0 ? value : field.enum.values[0].number;
    }
  }
  set(field, value) {
    assertOwn(this.message, field);
    if (this.check) {
      const err = checkField(field, value);
      if (err) {
        throw err;
      }
    }
    let local;
    if (field.fieldKind == "message") {
      local = messageToLocal(field, value);
    } else if (isReflectMap(value) || isReflectList(value)) {
      local = value[unsafeLocal];
    } else {
      local = longToLocal(field, value);
    }
    unsafeSet(this.message, field, local);
  }
  getUnknown() {
    return this.message.$unknown;
  }
  setUnknown(value) {
    this.message.$unknown = value;
  }
};
function assertOwn(owner, member) {
  if (member.parent.typeName !== owner.$typeName) {
    throw new FieldError(member, `cannot use ${member.toString()} with message ${owner.$typeName}`, "ForeignFieldError");
  }
}
var ReflectListImpl = class {
  field() {
    return this._field;
  }
  get size() {
    return this._arr.length;
  }
  constructor(field, unsafeInput, check) {
    this._field = field;
    this._arr = this[unsafeLocal] = unsafeInput;
    this.check = check;
  }
  get(index) {
    const item = this._arr[index];
    return item === void 0 ? void 0 : listItemToReflect(this._field, item, this.check);
  }
  set(index, item) {
    if (index < 0 || index >= this._arr.length) {
      throw new FieldError(this._field, `list item #${index + 1}: out of range`);
    }
    if (this.check) {
      const err = checkListItem(this._field, index, item);
      if (err) {
        throw err;
      }
    }
    this._arr[index] = listItemToLocal(this._field, item);
  }
  add(item) {
    if (this.check) {
      const err = checkListItem(this._field, this._arr.length, item);
      if (err) {
        throw err;
      }
    }
    this._arr.push(listItemToLocal(this._field, item));
    return void 0;
  }
  clear() {
    this._arr.splice(0, this._arr.length);
  }
  [Symbol.iterator]() {
    return this.values();
  }
  keys() {
    return this._arr.keys();
  }
  *values() {
    for (const item of this._arr) {
      yield listItemToReflect(this._field, item, this.check);
    }
  }
  *entries() {
    for (let i = 0; i < this._arr.length; i++) {
      yield [i, listItemToReflect(this._field, this._arr[i], this.check)];
    }
  }
};
var ReflectMapImpl = class {
  constructor(field, unsafeInput, check = true) {
    this.obj = this[unsafeLocal] = unsafeInput !== null && unsafeInput !== void 0 ? unsafeInput : {};
    this.check = check;
    this._field = field;
  }
  field() {
    return this._field;
  }
  set(key, value) {
    if (this.check) {
      const err = checkMapEntry(this._field, key, value);
      if (err) {
        throw err;
      }
    }
    this.obj[mapKeyToLocal(key)] = mapValueToLocal(this._field, value);
    return this;
  }
  delete(key) {
    const k = mapKeyToLocal(key);
    const has = Object.prototype.hasOwnProperty.call(this.obj, k);
    if (has) {
      delete this.obj[k];
    }
    return has;
  }
  clear() {
    for (const key of Object.keys(this.obj)) {
      delete this.obj[key];
    }
  }
  get(key) {
    let val = this.obj[mapKeyToLocal(key)];
    if (val !== void 0) {
      val = mapValueToReflect(this._field, val, this.check);
    }
    return val;
  }
  has(key) {
    return Object.prototype.hasOwnProperty.call(this.obj, mapKeyToLocal(key));
  }
  *keys() {
    for (const objKey of Object.keys(this.obj)) {
      yield mapKeyToReflect(objKey, this._field.mapKey);
    }
  }
  *entries() {
    for (const objEntry of Object.entries(this.obj)) {
      yield [
        mapKeyToReflect(objEntry[0], this._field.mapKey),
        mapValueToReflect(this._field, objEntry[1], this.check)
      ];
    }
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  get size() {
    return Object.keys(this.obj).length;
  }
  *values() {
    for (const val of Object.values(this.obj)) {
      yield mapValueToReflect(this._field, val, this.check);
    }
  }
  forEach(callbackfn, thisArg) {
    for (const mapEntry of this.entries()) {
      callbackfn.call(thisArg, mapEntry[1], mapEntry[0], this);
    }
  }
};
function messageToLocal(field, value) {
  if (!isReflectMessage(value)) {
    return value;
  }
  if (isWrapper(value.message) && !field.oneof && field.fieldKind == "message") {
    return value.message.value;
  }
  if (value.desc.typeName == "google.protobuf.Struct" && field.parent.typeName != "google.protobuf.Value") {
    return wktStructToLocal(value.message);
  }
  return value.message;
}
function messageToReflect(field, value, check) {
  if (value !== void 0) {
    if (isWrapperDesc(field.message) && !field.oneof && field.fieldKind == "message") {
      value = {
        $typeName: field.message.typeName,
        value: longToReflect(field.message.fields[0], value)
      };
    } else if (field.message.typeName == "google.protobuf.Struct" && field.parent.typeName != "google.protobuf.Value" && isObject(value)) {
      value = wktStructToReflect(value);
    }
  }
  return new ReflectMessageImpl(field.message, value, check);
}
function listItemToLocal(field, value) {
  if (field.listKind == "message") {
    return messageToLocal(field, value);
  }
  return longToLocal(field, value);
}
function listItemToReflect(field, value, check) {
  if (field.listKind == "message") {
    return messageToReflect(field, value, check);
  }
  return longToReflect(field, value);
}
function mapValueToLocal(field, value) {
  if (field.mapKind == "message") {
    return messageToLocal(field, value);
  }
  return longToLocal(field, value);
}
function mapValueToReflect(field, value, check) {
  if (field.mapKind == "message") {
    return messageToReflect(field, value, check);
  }
  return value;
}
function mapKeyToLocal(key) {
  return typeof key == "string" || typeof key == "number" ? key : String(key);
}
function mapKeyToReflect(key, type) {
  switch (type) {
    case ScalarType.STRING:
      return key;
    case ScalarType.INT32:
    case ScalarType.FIXED32:
    case ScalarType.UINT32:
    case ScalarType.SFIXED32:
    case ScalarType.SINT32: {
      const n = Number.parseInt(key);
      if (Number.isFinite(n)) {
        return n;
      }
      break;
    }
    case ScalarType.BOOL:
      switch (key) {
        case "true":
          return true;
        case "false":
          return false;
      }
      break;
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
      try {
        return protoInt64.uParse(key);
      } catch (_a) {
      }
      break;
    default:
      try {
        return protoInt64.parse(key);
      } catch (_b) {
      }
      break;
  }
  return key;
}
function longToReflect(field, value) {
  switch (field.scalar) {
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      if ("longAsString" in field && field.longAsString && typeof value == "string") {
        value = protoInt64.parse(value);
      }
      break;
    case ScalarType.FIXED64:
    case ScalarType.UINT64:
      if ("longAsString" in field && field.longAsString && typeof value == "string") {
        value = protoInt64.uParse(value);
      }
      break;
  }
  return value;
}
function longToLocal(field, value) {
  switch (field.scalar) {
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      if ("longAsString" in field && field.longAsString) {
        value = String(value);
      } else if (typeof value == "string" || typeof value == "number") {
        value = protoInt64.parse(value);
      }
      break;
    case ScalarType.FIXED64:
    case ScalarType.UINT64:
      if ("longAsString" in field && field.longAsString) {
        value = String(value);
      } else if (typeof value == "string" || typeof value == "number") {
        value = protoInt64.uParse(value);
      }
      break;
  }
  return value;
}
function wktStructToReflect(json) {
  const struct = {
    $typeName: "google.protobuf.Struct",
    fields: {}
  };
  if (isObject(json)) {
    for (const [k, v] of Object.entries(json)) {
      struct.fields[k] = wktValueToReflect(v);
    }
  }
  return struct;
}
function wktStructToLocal(val) {
  const json = {};
  for (const [k, v] of Object.entries(val.fields)) {
    json[k] = wktValueToLocal(v);
  }
  return json;
}
function wktValueToLocal(val) {
  switch (val.kind.case) {
    case "structValue":
      return wktStructToLocal(val.kind.value);
    case "listValue":
      return val.kind.value.values.map(wktValueToLocal);
    case "nullValue":
    case void 0:
      return null;
    default:
      return val.kind.value;
  }
}
function wktValueToReflect(json) {
  const value = {
    $typeName: "google.protobuf.Value",
    kind: { case: void 0 }
  };
  switch (typeof json) {
    case "number":
      value.kind = { case: "numberValue", value: json };
      break;
    case "string":
      value.kind = { case: "stringValue", value: json };
      break;
    case "boolean":
      value.kind = { case: "boolValue", value: json };
      break;
    case "object":
      if (json === null) {
        const nullValue = 0;
        value.kind = { case: "nullValue", value: nullValue };
      } else if (Array.isArray(json)) {
        const listValue = {
          $typeName: "google.protobuf.ListValue",
          values: []
        };
        if (Array.isArray(json)) {
          for (const e of json) {
            listValue.values.push(wktValueToReflect(e));
          }
        }
        value.kind = {
          case: "listValue",
          value: listValue
        };
      } else {
        value.kind = {
          case: "structValue",
          value: wktStructToReflect(json)
        };
      }
      break;
  }
  return value;
}

// node_modules/@bufbuild/protobuf/dist/esm/wire/base64-encoding.js
function base64Decode(base64Str) {
  const table = getDecodeTable();
  let es = base64Str.length * 3 / 4;
  if (base64Str[base64Str.length - 2] == "=")
    es -= 2;
  else if (base64Str[base64Str.length - 1] == "=")
    es -= 1;
  let bytes = new Uint8Array(es), bytePos = 0, groupPos = 0, b, p = 0;
  for (let i = 0; i < base64Str.length; i++) {
    b = table[base64Str.charCodeAt(i)];
    if (b === void 0) {
      switch (base64Str[i]) {
        // @ts-ignore TS7029: Fallthrough case in switch -- ignore instead of expect-error for compiler settings without noFallthroughCasesInSwitch: true
        case "=":
          groupPos = 0;
        // reset state when padding found
        case "\n":
        case "\r":
        case "	":
        case " ":
          continue;
        // skip white-space, and padding
        default:
          throw Error("invalid base64 string");
      }
    }
    switch (groupPos) {
      case 0:
        p = b;
        groupPos = 1;
        break;
      case 1:
        bytes[bytePos++] = p << 2 | (b & 48) >> 4;
        p = b;
        groupPos = 2;
        break;
      case 2:
        bytes[bytePos++] = (p & 15) << 4 | (b & 60) >> 2;
        p = b;
        groupPos = 3;
        break;
      case 3:
        bytes[bytePos++] = (p & 3) << 6 | b;
        groupPos = 0;
        break;
    }
  }
  if (groupPos == 1)
    throw Error("invalid base64 string");
  return bytes.subarray(0, bytePos);
}
var encodeTableStd;
var encodeTableUrl;
var decodeTable;
function getEncodeTable(encoding) {
  if (!encodeTableStd) {
    encodeTableStd = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
    encodeTableUrl = encodeTableStd.slice(0, -2).concat("-", "_");
  }
  return encoding == "url" ? (
    // biome-ignore lint/style/noNonNullAssertion: TS fails to narrow down
    encodeTableUrl
  ) : encodeTableStd;
}
function getDecodeTable() {
  if (!decodeTable) {
    decodeTable = [];
    const encodeTable = getEncodeTable("std");
    for (let i = 0; i < encodeTable.length; i++)
      decodeTable[encodeTable[i].charCodeAt(0)] = i;
    decodeTable["-".charCodeAt(0)] = encodeTable.indexOf("+");
    decodeTable["_".charCodeAt(0)] = encodeTable.indexOf("/");
  }
  return decodeTable;
}

// node_modules/@bufbuild/protobuf/dist/esm/reflect/names.js
function protoCamelCase(snakeCase) {
  let capNext = false;
  const b = [];
  for (let i = 0; i < snakeCase.length; i++) {
    let c = snakeCase.charAt(i);
    switch (c) {
      case "_":
        capNext = true;
        break;
      case "0":
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8":
      case "9":
        b.push(c);
        capNext = false;
        break;
      default:
        if (capNext) {
          capNext = false;
          c = c.toUpperCase();
        }
        b.push(c);
        break;
    }
  }
  return b.join("");
}
var reservedObjectProperties = /* @__PURE__ */ new Set([
  // names reserved by JavaScript
  "constructor",
  "toString",
  "toJSON",
  "valueOf"
]);
function safeObjectProperty(name) {
  return reservedObjectProperties.has(name) ? name + "$" : name;
}

// node_modules/@bufbuild/protobuf/dist/esm/codegenv2/restore-json-names.js
function restoreJsonNames(message) {
  for (const f of message.field) {
    if (!unsafeIsSetExplicit(f, "jsonName")) {
      f.jsonName = protoCamelCase(f.name);
    }
  }
  message.nestedType.forEach(restoreJsonNames);
}

// node_modules/@bufbuild/protobuf/dist/esm/wire/text-format.js
function parseTextFormatEnumValue(descEnum, value) {
  const enumValue = descEnum.values.find((v) => v.name === value);
  if (!enumValue) {
    throw new Error(`cannot parse ${descEnum} default value: ${value}`);
  }
  return enumValue.number;
}
function parseTextFormatScalarValue(type, value) {
  switch (type) {
    case ScalarType.STRING:
      return value;
    case ScalarType.BYTES: {
      const u = unescapeBytesDefaultValue(value);
      if (u === false) {
        throw new Error(`cannot parse ${ScalarType[type]} default value: ${value}`);
      }
      return u;
    }
    case ScalarType.INT64:
    case ScalarType.SFIXED64:
    case ScalarType.SINT64:
      return protoInt64.parse(value);
    case ScalarType.UINT64:
    case ScalarType.FIXED64:
      return protoInt64.uParse(value);
    case ScalarType.DOUBLE:
    case ScalarType.FLOAT:
      switch (value) {
        case "inf":
          return Number.POSITIVE_INFINITY;
        case "-inf":
          return Number.NEGATIVE_INFINITY;
        case "nan":
          return Number.NaN;
        default:
          return parseFloat(value);
      }
    case ScalarType.BOOL:
      return value === "true";
    case ScalarType.INT32:
    case ScalarType.UINT32:
    case ScalarType.SINT32:
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
      return parseInt(value, 10);
  }
}
function unescapeBytesDefaultValue(str) {
  const b = [];
  const input = {
    tail: str,
    c: "",
    next() {
      if (this.tail.length == 0) {
        return false;
      }
      this.c = this.tail[0];
      this.tail = this.tail.substring(1);
      return true;
    },
    take(n) {
      if (this.tail.length >= n) {
        const r = this.tail.substring(0, n);
        this.tail = this.tail.substring(n);
        return r;
      }
      return false;
    }
  };
  while (input.next()) {
    switch (input.c) {
      case "\\":
        if (input.next()) {
          switch (input.c) {
            case "\\":
              b.push(input.c.charCodeAt(0));
              break;
            case "b":
              b.push(8);
              break;
            case "f":
              b.push(12);
              break;
            case "n":
              b.push(10);
              break;
            case "r":
              b.push(13);
              break;
            case "t":
              b.push(9);
              break;
            case "v":
              b.push(11);
              break;
            case "0":
            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
            case "6":
            case "7": {
              const s = input.c;
              const t = input.take(2);
              if (t === false) {
                return false;
              }
              const n = parseInt(s + t, 8);
              if (Number.isNaN(n)) {
                return false;
              }
              b.push(n);
              break;
            }
            case "x": {
              const s = input.c;
              const t = input.take(2);
              if (t === false) {
                return false;
              }
              const n = parseInt(s + t, 16);
              if (Number.isNaN(n)) {
                return false;
              }
              b.push(n);
              break;
            }
            case "u": {
              const s = input.c;
              const t = input.take(4);
              if (t === false) {
                return false;
              }
              const n = parseInt(s + t, 16);
              if (Number.isNaN(n)) {
                return false;
              }
              const chunk = new Uint8Array(4);
              const view = new DataView(chunk.buffer);
              view.setInt32(0, n, true);
              b.push(chunk[0], chunk[1], chunk[2], chunk[3]);
              break;
            }
            case "U": {
              const s = input.c;
              const t = input.take(8);
              if (t === false) {
                return false;
              }
              const tc = protoInt64.uEnc(s + t);
              const chunk = new Uint8Array(8);
              const view = new DataView(chunk.buffer);
              view.setInt32(0, tc.lo, true);
              view.setInt32(4, tc.hi, true);
              b.push(chunk[0], chunk[1], chunk[2], chunk[3], chunk[4], chunk[5], chunk[6], chunk[7]);
              break;
            }
          }
        }
        break;
      default:
        b.push(input.c.charCodeAt(0));
    }
  }
  return new Uint8Array(b);
}

// node_modules/@bufbuild/protobuf/dist/esm/reflect/nested-types.js
function* nestedTypes(desc) {
  switch (desc.kind) {
    case "file":
      for (const message of desc.messages) {
        yield message;
        yield* nestedTypes(message);
      }
      yield* desc.enums;
      yield* desc.services;
      yield* desc.extensions;
      break;
    case "message":
      for (const message of desc.nestedMessages) {
        yield message;
        yield* nestedTypes(message);
      }
      yield* desc.nestedEnums;
      yield* desc.nestedExtensions;
      break;
  }
}

// node_modules/@bufbuild/protobuf/dist/esm/registry.js
function createFileRegistry(...args) {
  const registry = createBaseRegistry();
  if (!args.length) {
    return registry;
  }
  if ("$typeName" in args[0] && args[0].$typeName == "google.protobuf.FileDescriptorSet") {
    for (const file of args[0].file) {
      addFile(file, registry);
    }
    return registry;
  }
  if ("$typeName" in args[0]) {
    let recurseDeps = function(file) {
      const deps = [];
      for (const protoFileName of file.dependency) {
        if (registry.getFile(protoFileName) != void 0) {
          continue;
        }
        if (seen.has(protoFileName)) {
          continue;
        }
        const dep = resolve(protoFileName);
        if (!dep) {
          throw new Error(`Unable to resolve ${protoFileName}, imported by ${file.name}`);
        }
        if ("kind" in dep) {
          registry.addFile(dep, false, true);
        } else {
          seen.add(dep.name);
          deps.push(dep);
        }
      }
      return deps.concat(...deps.map(recurseDeps));
    };
    const input = args[0];
    const resolve = args[1];
    const seen = /* @__PURE__ */ new Set();
    for (const file of [input, ...recurseDeps(input)].reverse()) {
      addFile(file, registry);
    }
  } else {
    for (const fileReg of args) {
      for (const file of fileReg.files) {
        registry.addFile(file);
      }
    }
  }
  return registry;
}
function createBaseRegistry() {
  const types = /* @__PURE__ */ new Map();
  const extendees = /* @__PURE__ */ new Map();
  const files = /* @__PURE__ */ new Map();
  return {
    kind: "registry",
    types,
    extendees,
    [Symbol.iterator]() {
      return types.values();
    },
    get files() {
      return files.values();
    },
    addFile(file, skipTypes, withDeps) {
      files.set(file.proto.name, file);
      if (!skipTypes) {
        for (const type of nestedTypes(file)) {
          this.add(type);
        }
      }
      if (withDeps) {
        for (const f of file.dependencies) {
          this.addFile(f, skipTypes, withDeps);
        }
      }
    },
    add(desc) {
      if (desc.kind == "extension") {
        let numberToExt = extendees.get(desc.extendee.typeName);
        if (!numberToExt) {
          extendees.set(
            desc.extendee.typeName,
            // biome-ignore lint/suspicious/noAssignInExpressions: no
            numberToExt = /* @__PURE__ */ new Map()
          );
        }
        numberToExt.set(desc.number, desc);
      }
      types.set(desc.typeName, desc);
    },
    get(typeName) {
      return types.get(typeName);
    },
    getFile(fileName) {
      return files.get(fileName);
    },
    getMessage(typeName) {
      const t = types.get(typeName);
      return (t === null || t === void 0 ? void 0 : t.kind) == "message" ? t : void 0;
    },
    getEnum(typeName) {
      const t = types.get(typeName);
      return (t === null || t === void 0 ? void 0 : t.kind) == "enum" ? t : void 0;
    },
    getExtension(typeName) {
      const t = types.get(typeName);
      return (t === null || t === void 0 ? void 0 : t.kind) == "extension" ? t : void 0;
    },
    getExtensionFor(extendee, no) {
      var _a;
      return (_a = extendees.get(extendee.typeName)) === null || _a === void 0 ? void 0 : _a.get(no);
    },
    getService(typeName) {
      const t = types.get(typeName);
      return (t === null || t === void 0 ? void 0 : t.kind) == "service" ? t : void 0;
    }
  };
}
var EDITION_PROTO22 = 998;
var EDITION_PROTO32 = 999;
var TYPE_STRING = 9;
var TYPE_GROUP = 10;
var TYPE_MESSAGE = 11;
var TYPE_BYTES = 12;
var TYPE_ENUM = 14;
var LABEL_REPEATED = 3;
var LABEL_REQUIRED = 2;
var JS_STRING = 1;
var IDEMPOTENCY_UNKNOWN = 0;
var EXPLICIT = 1;
var IMPLICIT3 = 2;
var LEGACY_REQUIRED = 3;
var PACKED = 1;
var DELIMITED = 2;
var OPEN = 1;
var featureDefaults = {
  // EDITION_PROTO2
  998: {
    fieldPresence: 1,
    // EXPLICIT,
    enumType: 2,
    // CLOSED,
    repeatedFieldEncoding: 2,
    // EXPANDED,
    utf8Validation: 3,
    // NONE,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 2,
    // LEGACY_BEST_EFFORT,
    enforceNamingStyle: 2,
    // STYLE_LEGACY,
    defaultSymbolVisibility: 1
    // EXPORT_ALL,
  },
  // EDITION_PROTO3
  999: {
    fieldPresence: 2,
    // IMPLICIT,
    enumType: 1,
    // OPEN,
    repeatedFieldEncoding: 1,
    // PACKED,
    utf8Validation: 2,
    // VERIFY,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 1,
    // ALLOW,
    enforceNamingStyle: 2,
    // STYLE_LEGACY,
    defaultSymbolVisibility: 1
    // EXPORT_ALL,
  },
  // EDITION_2023
  1e3: {
    fieldPresence: 1,
    // EXPLICIT,
    enumType: 1,
    // OPEN,
    repeatedFieldEncoding: 1,
    // PACKED,
    utf8Validation: 2,
    // VERIFY,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 1,
    // ALLOW,
    enforceNamingStyle: 2,
    // STYLE_LEGACY,
    defaultSymbolVisibility: 1
    // EXPORT_ALL,
  },
  // EDITION_2024
  1001: {
    fieldPresence: 1,
    // EXPLICIT,
    enumType: 1,
    // OPEN,
    repeatedFieldEncoding: 1,
    // PACKED,
    utf8Validation: 2,
    // VERIFY,
    messageEncoding: 1,
    // LENGTH_PREFIXED,
    jsonFormat: 1,
    // ALLOW,
    enforceNamingStyle: 1,
    // STYLE2024,
    defaultSymbolVisibility: 2
    // EXPORT_TOP_LEVEL,
  }
};
function addFile(proto, reg) {
  var _a, _b;
  const file = {
    kind: "file",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    edition: getFileEdition(proto),
    name: proto.name.replace(/\.proto$/, ""),
    dependencies: findFileDependencies(proto, reg),
    enums: [],
    messages: [],
    extensions: [],
    services: [],
    toString() {
      return `file ${proto.name}`;
    }
  };
  const mapEntriesStore = /* @__PURE__ */ new Map();
  const mapEntries = {
    get(typeName) {
      return mapEntriesStore.get(typeName);
    },
    add(desc) {
      var _a2;
      assert(((_a2 = desc.proto.options) === null || _a2 === void 0 ? void 0 : _a2.mapEntry) === true);
      mapEntriesStore.set(desc.typeName, desc);
    }
  };
  for (const enumProto of proto.enumType) {
    addEnum(enumProto, file, void 0, reg);
  }
  for (const messageProto of proto.messageType) {
    addMessage(messageProto, file, void 0, reg, mapEntries);
  }
  for (const serviceProto of proto.service) {
    addService(serviceProto, file, reg);
  }
  addExtensions(file, reg);
  for (const mapEntry of mapEntriesStore.values()) {
    addFields(mapEntry, reg, mapEntries);
  }
  for (const message of file.messages) {
    addFields(message, reg, mapEntries);
    addExtensions(message, reg);
  }
  reg.addFile(file, true);
}
function addExtensions(desc, reg) {
  switch (desc.kind) {
    case "file":
      for (const proto of desc.proto.extension) {
        const ext = newField(proto, desc, reg);
        desc.extensions.push(ext);
        reg.add(ext);
      }
      break;
    case "message":
      for (const proto of desc.proto.extension) {
        const ext = newField(proto, desc, reg);
        desc.nestedExtensions.push(ext);
        reg.add(ext);
      }
      for (const message of desc.nestedMessages) {
        addExtensions(message, reg);
      }
      break;
  }
}
function addFields(message, reg, mapEntries) {
  const allOneofs = message.proto.oneofDecl.map((proto) => newOneof(proto, message));
  const oneofsSeen = /* @__PURE__ */ new Set();
  for (const proto of message.proto.field) {
    const oneof = findOneof(proto, allOneofs);
    const field = newField(proto, message, reg, oneof, mapEntries);
    message.fields.push(field);
    message.field[field.localName] = field;
    if (oneof === void 0) {
      message.members.push(field);
    } else {
      oneof.fields.push(field);
      if (!oneofsSeen.has(oneof)) {
        oneofsSeen.add(oneof);
        message.members.push(oneof);
      }
    }
  }
  for (const oneof of allOneofs.filter((o) => oneofsSeen.has(o))) {
    message.oneofs.push(oneof);
  }
  for (const child of message.nestedMessages) {
    addFields(child, reg, mapEntries);
  }
}
function addEnum(proto, file, parent, reg) {
  var _a, _b, _c, _d, _e;
  const sharedPrefix = findEnumSharedPrefix(proto.name, proto.value);
  const desc = {
    kind: "enum",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    file,
    parent,
    open: true,
    name: proto.name,
    typeName: makeTypeName(proto, parent, file),
    value: {},
    values: [],
    sharedPrefix,
    toString() {
      return `enum ${this.typeName}`;
    }
  };
  desc.open = isEnumOpen(desc);
  reg.add(desc);
  for (const p of proto.value) {
    const name = p.name;
    desc.values.push(
      // biome-ignore lint/suspicious/noAssignInExpressions: no
      desc.value[p.number] = {
        kind: "enum_value",
        proto: p,
        deprecated: (_d = (_c = p.options) === null || _c === void 0 ? void 0 : _c.deprecated) !== null && _d !== void 0 ? _d : false,
        parent: desc,
        name,
        localName: safeObjectProperty(sharedPrefix == void 0 ? name : name.substring(sharedPrefix.length)),
        number: p.number,
        toString() {
          return `enum value ${desc.typeName}.${name}`;
        }
      }
    );
  }
  ((_e = parent === null || parent === void 0 ? void 0 : parent.nestedEnums) !== null && _e !== void 0 ? _e : file.enums).push(desc);
}
function addMessage(proto, file, parent, reg, mapEntries) {
  var _a, _b, _c, _d;
  const desc = {
    kind: "message",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    file,
    parent,
    name: proto.name,
    typeName: makeTypeName(proto, parent, file),
    fields: [],
    field: {},
    oneofs: [],
    members: [],
    nestedEnums: [],
    nestedMessages: [],
    nestedExtensions: [],
    toString() {
      return `message ${this.typeName}`;
    }
  };
  if (((_c = proto.options) === null || _c === void 0 ? void 0 : _c.mapEntry) === true) {
    mapEntries.add(desc);
  } else {
    ((_d = parent === null || parent === void 0 ? void 0 : parent.nestedMessages) !== null && _d !== void 0 ? _d : file.messages).push(desc);
    reg.add(desc);
  }
  for (const enumProto of proto.enumType) {
    addEnum(enumProto, file, desc, reg);
  }
  for (const messageProto of proto.nestedType) {
    addMessage(messageProto, file, desc, reg, mapEntries);
  }
}
function addService(proto, file, reg) {
  var _a, _b;
  const desc = {
    kind: "service",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    file,
    name: proto.name,
    typeName: makeTypeName(proto, void 0, file),
    methods: [],
    method: {},
    toString() {
      return `service ${this.typeName}`;
    }
  };
  file.services.push(desc);
  reg.add(desc);
  for (const methodProto of proto.method) {
    const method = newMethod(methodProto, desc, reg);
    desc.methods.push(method);
    desc.method[method.localName] = method;
  }
}
function newMethod(proto, parent, reg) {
  var _a, _b, _c, _d;
  let methodKind;
  if (proto.clientStreaming && proto.serverStreaming) {
    methodKind = "bidi_streaming";
  } else if (proto.clientStreaming) {
    methodKind = "client_streaming";
  } else if (proto.serverStreaming) {
    methodKind = "server_streaming";
  } else {
    methodKind = "unary";
  }
  const input = reg.getMessage(trimLeadingDot(proto.inputType));
  const output = reg.getMessage(trimLeadingDot(proto.outputType));
  assert(input, `invalid MethodDescriptorProto: input_type ${proto.inputType} not found`);
  assert(output, `invalid MethodDescriptorProto: output_type ${proto.inputType} not found`);
  const name = proto.name;
  return {
    kind: "rpc",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    parent,
    name,
    localName: safeObjectProperty(name.length ? safeObjectProperty(name[0].toLowerCase() + name.substring(1)) : name),
    methodKind,
    input,
    output,
    idempotency: (_d = (_c = proto.options) === null || _c === void 0 ? void 0 : _c.idempotencyLevel) !== null && _d !== void 0 ? _d : IDEMPOTENCY_UNKNOWN,
    toString() {
      return `rpc ${parent.typeName}.${name}`;
    }
  };
}
function newOneof(proto, parent) {
  return {
    kind: "oneof",
    proto,
    deprecated: false,
    parent,
    fields: [],
    name: proto.name,
    localName: safeObjectProperty(protoCamelCase(proto.name)),
    toString() {
      return `oneof ${parent.typeName}.${this.name}`;
    }
  };
}
function newField(proto, parentOrFile, reg, oneof, mapEntries) {
  var _a, _b, _c;
  const isExtension = mapEntries === void 0;
  const field = {
    kind: "field",
    proto,
    deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
    name: proto.name,
    number: proto.number,
    scalar: void 0,
    message: void 0,
    enum: void 0,
    presence: getFieldPresence(proto, oneof, isExtension, parentOrFile),
    listKind: void 0,
    mapKind: void 0,
    mapKey: void 0,
    delimitedEncoding: void 0,
    packed: void 0,
    longAsString: false,
    getDefaultValue: void 0
  };
  if (isExtension) {
    const file = parentOrFile.kind == "file" ? parentOrFile : parentOrFile.file;
    const parent = parentOrFile.kind == "file" ? void 0 : parentOrFile;
    const typeName = makeTypeName(proto, parent, file);
    field.kind = "extension";
    field.file = file;
    field.parent = parent;
    field.oneof = void 0;
    field.typeName = typeName;
    field.jsonName = `[${typeName}]`;
    field.toString = () => `extension ${typeName}`;
    const extendee = reg.getMessage(trimLeadingDot(proto.extendee));
    assert(extendee, `invalid FieldDescriptorProto: extendee ${proto.extendee} not found`);
    field.extendee = extendee;
  } else {
    const parent = parentOrFile;
    assert(parent.kind == "message");
    field.parent = parent;
    field.oneof = oneof;
    field.localName = oneof ? protoCamelCase(proto.name) : safeObjectProperty(protoCamelCase(proto.name));
    field.jsonName = proto.jsonName;
    field.toString = () => `field ${parent.typeName}.${proto.name}`;
  }
  const label = proto.label;
  const type = proto.type;
  const jstype = (_c = proto.options) === null || _c === void 0 ? void 0 : _c.jstype;
  if (label === LABEL_REPEATED) {
    const mapEntry = type == TYPE_MESSAGE ? mapEntries === null || mapEntries === void 0 ? void 0 : mapEntries.get(trimLeadingDot(proto.typeName)) : void 0;
    if (mapEntry) {
      field.fieldKind = "map";
      const { key, value } = findMapEntryFields(mapEntry);
      field.mapKey = key.scalar;
      field.mapKind = value.fieldKind;
      field.message = value.message;
      field.delimitedEncoding = false;
      field.enum = value.enum;
      field.scalar = value.scalar;
      return field;
    }
    field.fieldKind = "list";
    switch (type) {
      case TYPE_MESSAGE:
      case TYPE_GROUP:
        field.listKind = "message";
        field.message = reg.getMessage(trimLeadingDot(proto.typeName));
        assert(field.message);
        field.delimitedEncoding = isDelimitedEncoding(proto, parentOrFile);
        break;
      case TYPE_ENUM:
        field.listKind = "enum";
        field.enum = reg.getEnum(trimLeadingDot(proto.typeName));
        assert(field.enum);
        break;
      default:
        field.listKind = "scalar";
        field.scalar = type;
        field.longAsString = jstype == JS_STRING;
        break;
    }
    field.packed = isPackedField(proto, parentOrFile);
    return field;
  }
  switch (type) {
    case TYPE_MESSAGE:
    case TYPE_GROUP:
      field.fieldKind = "message";
      field.message = reg.getMessage(trimLeadingDot(proto.typeName));
      assert(field.message, `invalid FieldDescriptorProto: type_name ${proto.typeName} not found`);
      field.delimitedEncoding = isDelimitedEncoding(proto, parentOrFile);
      field.getDefaultValue = () => void 0;
      break;
    case TYPE_ENUM: {
      const enumeration = reg.getEnum(trimLeadingDot(proto.typeName));
      assert(enumeration !== void 0, `invalid FieldDescriptorProto: type_name ${proto.typeName} not found`);
      field.fieldKind = "enum";
      field.enum = reg.getEnum(trimLeadingDot(proto.typeName));
      field.getDefaultValue = () => {
        return unsafeIsSetExplicit(proto, "defaultValue") ? parseTextFormatEnumValue(enumeration, proto.defaultValue) : void 0;
      };
      break;
    }
    default: {
      field.fieldKind = "scalar";
      field.scalar = type;
      field.longAsString = jstype == JS_STRING;
      field.getDefaultValue = () => {
        return unsafeIsSetExplicit(proto, "defaultValue") ? parseTextFormatScalarValue(type, proto.defaultValue) : void 0;
      };
      break;
    }
  }
  return field;
}
function getFileEdition(proto) {
  switch (proto.syntax) {
    case "":
    case "proto2":
      return EDITION_PROTO22;
    case "proto3":
      return EDITION_PROTO32;
    case "editions":
      if (proto.edition in featureDefaults) {
        return proto.edition;
      }
      throw new Error(`${proto.name}: unsupported edition`);
    default:
      throw new Error(`${proto.name}: unsupported syntax "${proto.syntax}"`);
  }
}
function findFileDependencies(proto, reg) {
  return proto.dependency.map((wantName) => {
    const dep = reg.getFile(wantName);
    if (!dep) {
      throw new Error(`Cannot find ${wantName}, imported by ${proto.name}`);
    }
    return dep;
  });
}
function findEnumSharedPrefix(enumName, values) {
  const prefix = camelToSnakeCase(enumName) + "_";
  for (const value of values) {
    if (!value.name.toLowerCase().startsWith(prefix)) {
      return void 0;
    }
    const shortName = value.name.substring(prefix.length);
    if (shortName.length == 0) {
      return void 0;
    }
    if (/^\d/.test(shortName)) {
      return void 0;
    }
  }
  return prefix;
}
function camelToSnakeCase(camel) {
  return (camel.substring(0, 1) + camel.substring(1).replace(/[A-Z]/g, (c) => "_" + c)).toLowerCase();
}
function makeTypeName(proto, parent, file) {
  let typeName;
  if (parent) {
    typeName = `${parent.typeName}.${proto.name}`;
  } else if (file.proto.package.length > 0) {
    typeName = `${file.proto.package}.${proto.name}`;
  } else {
    typeName = `${proto.name}`;
  }
  return typeName;
}
function trimLeadingDot(typeName) {
  return typeName.startsWith(".") ? typeName.substring(1) : typeName;
}
function findOneof(proto, allOneofs) {
  if (!unsafeIsSetExplicit(proto, "oneofIndex")) {
    return void 0;
  }
  if (proto.proto3Optional) {
    return void 0;
  }
  const oneof = allOneofs[proto.oneofIndex];
  assert(oneof, `invalid FieldDescriptorProto: oneof #${proto.oneofIndex} for field #${proto.number} not found`);
  return oneof;
}
function getFieldPresence(proto, oneof, isExtension, parent) {
  if (proto.label == LABEL_REQUIRED) {
    return LEGACY_REQUIRED;
  }
  if (proto.label == LABEL_REPEATED) {
    return IMPLICIT3;
  }
  if (!!oneof || proto.proto3Optional) {
    return EXPLICIT;
  }
  if (isExtension) {
    return EXPLICIT;
  }
  const resolved = resolveFeature("fieldPresence", { proto, parent });
  if (resolved == IMPLICIT3 && (proto.type == TYPE_MESSAGE || proto.type == TYPE_GROUP)) {
    return EXPLICIT;
  }
  return resolved;
}
function isPackedField(proto, parent) {
  if (proto.label != LABEL_REPEATED) {
    return false;
  }
  switch (proto.type) {
    case TYPE_STRING:
    case TYPE_BYTES:
    case TYPE_GROUP:
    case TYPE_MESSAGE:
      return false;
  }
  const o = proto.options;
  if (o && unsafeIsSetExplicit(o, "packed")) {
    return o.packed;
  }
  return PACKED == resolveFeature("repeatedFieldEncoding", {
    proto,
    parent
  });
}
function findMapEntryFields(mapEntry) {
  const key = mapEntry.fields.find((f) => f.number === 1);
  const value = mapEntry.fields.find((f) => f.number === 2);
  assert(key && key.fieldKind == "scalar" && key.scalar != ScalarType.BYTES && key.scalar != ScalarType.FLOAT && key.scalar != ScalarType.DOUBLE && value && value.fieldKind != "list" && value.fieldKind != "map");
  return { key, value };
}
function isEnumOpen(desc) {
  var _a;
  return OPEN == resolveFeature("enumType", {
    proto: desc.proto,
    parent: (_a = desc.parent) !== null && _a !== void 0 ? _a : desc.file
  });
}
function isDelimitedEncoding(proto, parent) {
  if (proto.type == TYPE_GROUP) {
    return true;
  }
  return DELIMITED == resolveFeature("messageEncoding", {
    proto,
    parent
  });
}
function resolveFeature(name, ref) {
  var _a, _b;
  const featureSet = (_a = ref.proto.options) === null || _a === void 0 ? void 0 : _a.features;
  if (featureSet) {
    const val = featureSet[name];
    if (val != 0) {
      return val;
    }
  }
  if ("kind" in ref) {
    if (ref.kind == "message") {
      return resolveFeature(name, (_b = ref.parent) !== null && _b !== void 0 ? _b : ref.file);
    }
    const editionDefaults = featureDefaults[ref.edition];
    if (!editionDefaults) {
      throw new Error(`feature default for edition ${ref.edition} not found`);
    }
    return editionDefaults[name];
  }
  return resolveFeature(name, ref.parent);
}
function assert(condition, msg) {
  if (!condition) {
    throw new Error(msg);
  }
}

// node_modules/@bufbuild/protobuf/dist/esm/codegenv2/boot.js
function boot(boot2) {
  const root = bootFileDescriptorProto(boot2);
  root.messageType.forEach(restoreJsonNames);
  const reg = createFileRegistry(root, () => void 0);
  return reg.getFile(root.name);
}
function bootFileDescriptorProto(init) {
  const proto = /* @__PURE__ */ Object.create({
    syntax: "",
    edition: 0
  });
  return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FileDescriptorProto", dependency: [], publicDependency: [], weakDependency: [], optionDependency: [], service: [], extension: [] }, init), { messageType: init.messageType.map(bootDescriptorProto), enumType: init.enumType.map(bootEnumDescriptorProto) }));
}
function bootDescriptorProto(init) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const proto = /* @__PURE__ */ Object.create({
    visibility: 0
  });
  return Object.assign(proto, {
    $typeName: "google.protobuf.DescriptorProto",
    name: init.name,
    field: (_b = (_a = init.field) === null || _a === void 0 ? void 0 : _a.map(bootFieldDescriptorProto)) !== null && _b !== void 0 ? _b : [],
    extension: [],
    nestedType: (_d = (_c = init.nestedType) === null || _c === void 0 ? void 0 : _c.map(bootDescriptorProto)) !== null && _d !== void 0 ? _d : [],
    enumType: (_f = (_e = init.enumType) === null || _e === void 0 ? void 0 : _e.map(bootEnumDescriptorProto)) !== null && _f !== void 0 ? _f : [],
    extensionRange: (_h = (_g = init.extensionRange) === null || _g === void 0 ? void 0 : _g.map((e) => Object.assign({ $typeName: "google.protobuf.DescriptorProto.ExtensionRange" }, e))) !== null && _h !== void 0 ? _h : [],
    oneofDecl: [],
    reservedRange: [],
    reservedName: []
  });
}
function bootFieldDescriptorProto(init) {
  const proto = /* @__PURE__ */ Object.create({
    label: 1,
    typeName: "",
    extendee: "",
    defaultValue: "",
    oneofIndex: 0,
    jsonName: "",
    proto3Optional: false
  });
  return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FieldDescriptorProto" }, init), { options: init.options ? bootFieldOptions(init.options) : void 0 }));
}
function bootFieldOptions(init) {
  var _a, _b, _c;
  const proto = /* @__PURE__ */ Object.create({
    ctype: 0,
    packed: false,
    jstype: 0,
    lazy: false,
    unverifiedLazy: false,
    deprecated: false,
    weak: false,
    debugRedact: false,
    retention: 0
  });
  return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FieldOptions" }, init), { targets: (_a = init.targets) !== null && _a !== void 0 ? _a : [], editionDefaults: (_c = (_b = init.editionDefaults) === null || _b === void 0 ? void 0 : _b.map((e) => Object.assign({ $typeName: "google.protobuf.FieldOptions.EditionDefault" }, e))) !== null && _c !== void 0 ? _c : [], uninterpretedOption: [] }));
}
function bootEnumDescriptorProto(init) {
  const proto = /* @__PURE__ */ Object.create({
    visibility: 0
  });
  return Object.assign(proto, {
    $typeName: "google.protobuf.EnumDescriptorProto",
    name: init.name,
    reservedName: [],
    reservedRange: [],
    value: init.value.map((e) => Object.assign({ $typeName: "google.protobuf.EnumValueDescriptorProto" }, e))
  });
}

// node_modules/@bufbuild/protobuf/dist/esm/codegenv2/message.js
function messageDesc(file, path, ...paths) {
  return paths.reduce((acc, cur) => acc.nestedMessages[cur], file.messages[path]);
}

// node_modules/@bufbuild/protobuf/dist/esm/wkt/gen/google/protobuf/descriptor_pb.js
var file_google_protobuf_descriptor = /* @__PURE__ */ boot({ "name": "google/protobuf/descriptor.proto", "package": "google.protobuf", "messageType": [{ "name": "FileDescriptorSet", "field": [{ "name": "file", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.FileDescriptorProto" }], "extensionRange": [{ "start": 536e6, "end": 536000001 }] }, { "name": "FileDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "package", "number": 2, "type": 9, "label": 1 }, { "name": "dependency", "number": 3, "type": 9, "label": 3 }, { "name": "public_dependency", "number": 10, "type": 5, "label": 3 }, { "name": "weak_dependency", "number": 11, "type": 5, "label": 3 }, { "name": "option_dependency", "number": 15, "type": 9, "label": 3 }, { "name": "message_type", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto" }, { "name": "enum_type", "number": 5, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto" }, { "name": "service", "number": 6, "type": 11, "label": 3, "typeName": ".google.protobuf.ServiceDescriptorProto" }, { "name": "extension", "number": 7, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "options", "number": 8, "type": 11, "label": 1, "typeName": ".google.protobuf.FileOptions" }, { "name": "source_code_info", "number": 9, "type": 11, "label": 1, "typeName": ".google.protobuf.SourceCodeInfo" }, { "name": "syntax", "number": 12, "type": 9, "label": 1 }, { "name": "edition", "number": 14, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }] }, { "name": "DescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "field", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "extension", "number": 6, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "nested_type", "number": 3, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto" }, { "name": "enum_type", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto" }, { "name": "extension_range", "number": 5, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto.ExtensionRange" }, { "name": "oneof_decl", "number": 8, "type": 11, "label": 3, "typeName": ".google.protobuf.OneofDescriptorProto" }, { "name": "options", "number": 7, "type": 11, "label": 1, "typeName": ".google.protobuf.MessageOptions" }, { "name": "reserved_range", "number": 9, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto.ReservedRange" }, { "name": "reserved_name", "number": 10, "type": 9, "label": 3 }, { "name": "visibility", "number": 11, "type": 14, "label": 1, "typeName": ".google.protobuf.SymbolVisibility" }], "nestedType": [{ "name": "ExtensionRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.ExtensionRangeOptions" }] }, { "name": "ReservedRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }] }] }, { "name": "ExtensionRangeOptions", "field": [{ "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }, { "name": "declaration", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.ExtensionRangeOptions.Declaration", "options": { "retention": 2 } }, { "name": "features", "number": 50, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "verification", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.ExtensionRangeOptions.VerificationState", "defaultValue": "UNVERIFIED", "options": { "retention": 2 } }], "nestedType": [{ "name": "Declaration", "field": [{ "name": "number", "number": 1, "type": 5, "label": 1 }, { "name": "full_name", "number": 2, "type": 9, "label": 1 }, { "name": "type", "number": 3, "type": 9, "label": 1 }, { "name": "reserved", "number": 5, "type": 8, "label": 1 }, { "name": "repeated", "number": 6, "type": 8, "label": 1 }] }], "enumType": [{ "name": "VerificationState", "value": [{ "name": "DECLARATION", "number": 0 }, { "name": "UNVERIFIED", "number": 1 }] }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "FieldDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "number", "number": 3, "type": 5, "label": 1 }, { "name": "label", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldDescriptorProto.Label" }, { "name": "type", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldDescriptorProto.Type" }, { "name": "type_name", "number": 6, "type": 9, "label": 1 }, { "name": "extendee", "number": 2, "type": 9, "label": 1 }, { "name": "default_value", "number": 7, "type": 9, "label": 1 }, { "name": "oneof_index", "number": 9, "type": 5, "label": 1 }, { "name": "json_name", "number": 10, "type": 9, "label": 1 }, { "name": "options", "number": 8, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions" }, { "name": "proto3_optional", "number": 17, "type": 8, "label": 1 }], "enumType": [{ "name": "Type", "value": [{ "name": "TYPE_DOUBLE", "number": 1 }, { "name": "TYPE_FLOAT", "number": 2 }, { "name": "TYPE_INT64", "number": 3 }, { "name": "TYPE_UINT64", "number": 4 }, { "name": "TYPE_INT32", "number": 5 }, { "name": "TYPE_FIXED64", "number": 6 }, { "name": "TYPE_FIXED32", "number": 7 }, { "name": "TYPE_BOOL", "number": 8 }, { "name": "TYPE_STRING", "number": 9 }, { "name": "TYPE_GROUP", "number": 10 }, { "name": "TYPE_MESSAGE", "number": 11 }, { "name": "TYPE_BYTES", "number": 12 }, { "name": "TYPE_UINT32", "number": 13 }, { "name": "TYPE_ENUM", "number": 14 }, { "name": "TYPE_SFIXED32", "number": 15 }, { "name": "TYPE_SFIXED64", "number": 16 }, { "name": "TYPE_SINT32", "number": 17 }, { "name": "TYPE_SINT64", "number": 18 }] }, { "name": "Label", "value": [{ "name": "LABEL_OPTIONAL", "number": 1 }, { "name": "LABEL_REPEATED", "number": 3 }, { "name": "LABEL_REQUIRED", "number": 2 }] }] }, { "name": "OneofDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "options", "number": 2, "type": 11, "label": 1, "typeName": ".google.protobuf.OneofOptions" }] }, { "name": "EnumDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "value", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumValueDescriptorProto" }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.EnumOptions" }, { "name": "reserved_range", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto.EnumReservedRange" }, { "name": "reserved_name", "number": 5, "type": 9, "label": 3 }, { "name": "visibility", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.SymbolVisibility" }], "nestedType": [{ "name": "EnumReservedRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }] }] }, { "name": "EnumValueDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "number", "number": 2, "type": 5, "label": 1 }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.EnumValueOptions" }] }, { "name": "ServiceDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "method", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.MethodDescriptorProto" }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.ServiceOptions" }] }, { "name": "MethodDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "input_type", "number": 2, "type": 9, "label": 1 }, { "name": "output_type", "number": 3, "type": 9, "label": 1 }, { "name": "options", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.MethodOptions" }, { "name": "client_streaming", "number": 5, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "server_streaming", "number": 6, "type": 8, "label": 1, "defaultValue": "false" }] }, { "name": "FileOptions", "field": [{ "name": "java_package", "number": 1, "type": 9, "label": 1 }, { "name": "java_outer_classname", "number": 8, "type": 9, "label": 1 }, { "name": "java_multiple_files", "number": 10, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "java_generate_equals_and_hash", "number": 20, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "java_string_check_utf8", "number": 27, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "optimize_for", "number": 9, "type": 14, "label": 1, "typeName": ".google.protobuf.FileOptions.OptimizeMode", "defaultValue": "SPEED" }, { "name": "go_package", "number": 11, "type": 9, "label": 1 }, { "name": "cc_generic_services", "number": 16, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "java_generic_services", "number": 17, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "py_generic_services", "number": 18, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 23, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "cc_enable_arenas", "number": 31, "type": 8, "label": 1, "defaultValue": "true" }, { "name": "objc_class_prefix", "number": 36, "type": 9, "label": 1 }, { "name": "csharp_namespace", "number": 37, "type": 9, "label": 1 }, { "name": "swift_prefix", "number": 39, "type": 9, "label": 1 }, { "name": "php_class_prefix", "number": 40, "type": 9, "label": 1 }, { "name": "php_namespace", "number": 41, "type": 9, "label": 1 }, { "name": "php_metadata_namespace", "number": 44, "type": 9, "label": 1 }, { "name": "ruby_package", "number": 45, "type": 9, "label": 1 }, { "name": "features", "number": 50, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "enumType": [{ "name": "OptimizeMode", "value": [{ "name": "SPEED", "number": 1 }, { "name": "CODE_SIZE", "number": 2 }, { "name": "LITE_RUNTIME", "number": 3 }] }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "MessageOptions", "field": [{ "name": "message_set_wire_format", "number": 1, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "no_standard_descriptor_accessor", "number": 2, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "map_entry", "number": 7, "type": 8, "label": 1 }, { "name": "deprecated_legacy_json_field_conflicts", "number": 11, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "features", "number": 12, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "FieldOptions", "field": [{ "name": "ctype", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.CType", "defaultValue": "STRING" }, { "name": "packed", "number": 2, "type": 8, "label": 1 }, { "name": "jstype", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.JSType", "defaultValue": "JS_NORMAL" }, { "name": "lazy", "number": 5, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "unverified_lazy", "number": 15, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "weak", "number": 10, "type": 8, "label": 1, "defaultValue": "false", "options": { "deprecated": true } }, { "name": "debug_redact", "number": 16, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "retention", "number": 17, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.OptionRetention" }, { "name": "targets", "number": 19, "type": 14, "label": 3, "typeName": ".google.protobuf.FieldOptions.OptionTargetType" }, { "name": "edition_defaults", "number": 20, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldOptions.EditionDefault" }, { "name": "features", "number": 21, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "feature_support", "number": 22, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions.FeatureSupport" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "nestedType": [{ "name": "EditionDefault", "field": [{ "name": "edition", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "value", "number": 2, "type": 9, "label": 1 }] }, { "name": "FeatureSupport", "field": [{ "name": "edition_introduced", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "edition_deprecated", "number": 2, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "deprecation_warning", "number": 3, "type": 9, "label": 1 }, { "name": "edition_removed", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }] }], "enumType": [{ "name": "CType", "value": [{ "name": "STRING", "number": 0 }, { "name": "CORD", "number": 1 }, { "name": "STRING_PIECE", "number": 2 }] }, { "name": "JSType", "value": [{ "name": "JS_NORMAL", "number": 0 }, { "name": "JS_STRING", "number": 1 }, { "name": "JS_NUMBER", "number": 2 }] }, { "name": "OptionRetention", "value": [{ "name": "RETENTION_UNKNOWN", "number": 0 }, { "name": "RETENTION_RUNTIME", "number": 1 }, { "name": "RETENTION_SOURCE", "number": 2 }] }, { "name": "OptionTargetType", "value": [{ "name": "TARGET_TYPE_UNKNOWN", "number": 0 }, { "name": "TARGET_TYPE_FILE", "number": 1 }, { "name": "TARGET_TYPE_EXTENSION_RANGE", "number": 2 }, { "name": "TARGET_TYPE_MESSAGE", "number": 3 }, { "name": "TARGET_TYPE_FIELD", "number": 4 }, { "name": "TARGET_TYPE_ONEOF", "number": 5 }, { "name": "TARGET_TYPE_ENUM", "number": 6 }, { "name": "TARGET_TYPE_ENUM_ENTRY", "number": 7 }, { "name": "TARGET_TYPE_SERVICE", "number": 8 }, { "name": "TARGET_TYPE_METHOD", "number": 9 }] }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "OneofOptions", "field": [{ "name": "features", "number": 1, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "EnumOptions", "field": [{ "name": "allow_alias", "number": 2, "type": 8, "label": 1 }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated_legacy_json_field_conflicts", "number": 6, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "features", "number": 7, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "EnumValueOptions", "field": [{ "name": "deprecated", "number": 1, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "features", "number": 2, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "debug_redact", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "feature_support", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions.FeatureSupport" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "ServiceOptions", "field": [{ "name": "features", "number": 34, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "deprecated", "number": 33, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "MethodOptions", "field": [{ "name": "deprecated", "number": 33, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "idempotency_level", "number": 34, "type": 14, "label": 1, "typeName": ".google.protobuf.MethodOptions.IdempotencyLevel", "defaultValue": "IDEMPOTENCY_UNKNOWN" }, { "name": "features", "number": 35, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "enumType": [{ "name": "IdempotencyLevel", "value": [{ "name": "IDEMPOTENCY_UNKNOWN", "number": 0 }, { "name": "NO_SIDE_EFFECTS", "number": 1 }, { "name": "IDEMPOTENT", "number": 2 }] }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "UninterpretedOption", "field": [{ "name": "name", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption.NamePart" }, { "name": "identifier_value", "number": 3, "type": 9, "label": 1 }, { "name": "positive_int_value", "number": 4, "type": 4, "label": 1 }, { "name": "negative_int_value", "number": 5, "type": 3, "label": 1 }, { "name": "double_value", "number": 6, "type": 1, "label": 1 }, { "name": "string_value", "number": 7, "type": 12, "label": 1 }, { "name": "aggregate_value", "number": 8, "type": 9, "label": 1 }], "nestedType": [{ "name": "NamePart", "field": [{ "name": "name_part", "number": 1, "type": 9, "label": 2 }, { "name": "is_extension", "number": 2, "type": 8, "label": 2 }] }] }, { "name": "FeatureSet", "field": [{ "name": "field_presence", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.FieldPresence", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "EXPLICIT", "edition": 900 }, { "value": "IMPLICIT", "edition": 999 }, { "value": "EXPLICIT", "edition": 1e3 }] } }, { "name": "enum_type", "number": 2, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.EnumType", "options": { "retention": 1, "targets": [6, 1], "editionDefaults": [{ "value": "CLOSED", "edition": 900 }, { "value": "OPEN", "edition": 999 }] } }, { "name": "repeated_field_encoding", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.RepeatedFieldEncoding", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "EXPANDED", "edition": 900 }, { "value": "PACKED", "edition": 999 }] } }, { "name": "utf8_validation", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.Utf8Validation", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "NONE", "edition": 900 }, { "value": "VERIFY", "edition": 999 }] } }, { "name": "message_encoding", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.MessageEncoding", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "LENGTH_PREFIXED", "edition": 900 }] } }, { "name": "json_format", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.JsonFormat", "options": { "retention": 1, "targets": [3, 6, 1], "editionDefaults": [{ "value": "LEGACY_BEST_EFFORT", "edition": 900 }, { "value": "ALLOW", "edition": 999 }] } }, { "name": "enforce_naming_style", "number": 7, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.EnforceNamingStyle", "options": { "retention": 2, "targets": [1, 2, 3, 4, 5, 6, 7, 8, 9], "editionDefaults": [{ "value": "STYLE_LEGACY", "edition": 900 }, { "value": "STYLE2024", "edition": 1001 }] } }, { "name": "default_symbol_visibility", "number": 8, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.VisibilityFeature.DefaultSymbolVisibility", "options": { "retention": 2, "targets": [1], "editionDefaults": [{ "value": "EXPORT_ALL", "edition": 900 }, { "value": "EXPORT_TOP_LEVEL", "edition": 1001 }] } }], "nestedType": [{ "name": "VisibilityFeature", "enumType": [{ "name": "DefaultSymbolVisibility", "value": [{ "name": "DEFAULT_SYMBOL_VISIBILITY_UNKNOWN", "number": 0 }, { "name": "EXPORT_ALL", "number": 1 }, { "name": "EXPORT_TOP_LEVEL", "number": 2 }, { "name": "LOCAL_ALL", "number": 3 }, { "name": "STRICT", "number": 4 }] }] }], "enumType": [{ "name": "FieldPresence", "value": [{ "name": "FIELD_PRESENCE_UNKNOWN", "number": 0 }, { "name": "EXPLICIT", "number": 1 }, { "name": "IMPLICIT", "number": 2 }, { "name": "LEGACY_REQUIRED", "number": 3 }] }, { "name": "EnumType", "value": [{ "name": "ENUM_TYPE_UNKNOWN", "number": 0 }, { "name": "OPEN", "number": 1 }, { "name": "CLOSED", "number": 2 }] }, { "name": "RepeatedFieldEncoding", "value": [{ "name": "REPEATED_FIELD_ENCODING_UNKNOWN", "number": 0 }, { "name": "PACKED", "number": 1 }, { "name": "EXPANDED", "number": 2 }] }, { "name": "Utf8Validation", "value": [{ "name": "UTF8_VALIDATION_UNKNOWN", "number": 0 }, { "name": "VERIFY", "number": 2 }, { "name": "NONE", "number": 3 }] }, { "name": "MessageEncoding", "value": [{ "name": "MESSAGE_ENCODING_UNKNOWN", "number": 0 }, { "name": "LENGTH_PREFIXED", "number": 1 }, { "name": "DELIMITED", "number": 2 }] }, { "name": "JsonFormat", "value": [{ "name": "JSON_FORMAT_UNKNOWN", "number": 0 }, { "name": "ALLOW", "number": 1 }, { "name": "LEGACY_BEST_EFFORT", "number": 2 }] }, { "name": "EnforceNamingStyle", "value": [{ "name": "ENFORCE_NAMING_STYLE_UNKNOWN", "number": 0 }, { "name": "STYLE2024", "number": 1 }, { "name": "STYLE_LEGACY", "number": 2 }] }], "extensionRange": [{ "start": 1e3, "end": 9995 }, { "start": 9995, "end": 1e4 }, { "start": 1e4, "end": 10001 }] }, { "name": "FeatureSetDefaults", "field": [{ "name": "defaults", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.FeatureSetDefaults.FeatureSetEditionDefault" }, { "name": "minimum_edition", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "maximum_edition", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }], "nestedType": [{ "name": "FeatureSetEditionDefault", "field": [{ "name": "edition", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "overridable_features", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "fixed_features", "number": 5, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }] }] }, { "name": "SourceCodeInfo", "field": [{ "name": "location", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.SourceCodeInfo.Location" }], "nestedType": [{ "name": "Location", "field": [{ "name": "path", "number": 1, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "span", "number": 2, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "leading_comments", "number": 3, "type": 9, "label": 1 }, { "name": "trailing_comments", "number": 4, "type": 9, "label": 1 }, { "name": "leading_detached_comments", "number": 6, "type": 9, "label": 3 }] }], "extensionRange": [{ "start": 536e6, "end": 536000001 }] }, { "name": "GeneratedCodeInfo", "field": [{ "name": "annotation", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.GeneratedCodeInfo.Annotation" }], "nestedType": [{ "name": "Annotation", "field": [{ "name": "path", "number": 1, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "source_file", "number": 2, "type": 9, "label": 1 }, { "name": "begin", "number": 3, "type": 5, "label": 1 }, { "name": "end", "number": 4, "type": 5, "label": 1 }, { "name": "semantic", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.GeneratedCodeInfo.Annotation.Semantic" }], "enumType": [{ "name": "Semantic", "value": [{ "name": "NONE", "number": 0 }, { "name": "SET", "number": 1 }, { "name": "ALIAS", "number": 2 }] }] }] }], "enumType": [{ "name": "Edition", "value": [{ "name": "EDITION_UNKNOWN", "number": 0 }, { "name": "EDITION_LEGACY", "number": 900 }, { "name": "EDITION_PROTO2", "number": 998 }, { "name": "EDITION_PROTO3", "number": 999 }, { "name": "EDITION_2023", "number": 1e3 }, { "name": "EDITION_2024", "number": 1001 }, { "name": "EDITION_1_TEST_ONLY", "number": 1 }, { "name": "EDITION_2_TEST_ONLY", "number": 2 }, { "name": "EDITION_99997_TEST_ONLY", "number": 99997 }, { "name": "EDITION_99998_TEST_ONLY", "number": 99998 }, { "name": "EDITION_99999_TEST_ONLY", "number": 99999 }, { "name": "EDITION_MAX", "number": 2147483647 }] }, { "name": "SymbolVisibility", "value": [{ "name": "VISIBILITY_UNSET", "number": 0 }, { "name": "VISIBILITY_LOCAL", "number": 1 }, { "name": "VISIBILITY_EXPORT", "number": 2 }] }] });
var FileDescriptorProtoSchema = /* @__PURE__ */ messageDesc(file_google_protobuf_descriptor, 1);
var ExtensionRangeOptions_VerificationState;
(function(ExtensionRangeOptions_VerificationState2) {
  ExtensionRangeOptions_VerificationState2[ExtensionRangeOptions_VerificationState2["DECLARATION"] = 0] = "DECLARATION";
  ExtensionRangeOptions_VerificationState2[ExtensionRangeOptions_VerificationState2["UNVERIFIED"] = 1] = "UNVERIFIED";
})(ExtensionRangeOptions_VerificationState || (ExtensionRangeOptions_VerificationState = {}));
var FieldDescriptorProto_Type;
(function(FieldDescriptorProto_Type2) {
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["DOUBLE"] = 1] = "DOUBLE";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FLOAT"] = 2] = "FLOAT";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["INT64"] = 3] = "INT64";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["UINT64"] = 4] = "UINT64";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["INT32"] = 5] = "INT32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FIXED64"] = 6] = "FIXED64";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FIXED32"] = 7] = "FIXED32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["BOOL"] = 8] = "BOOL";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["STRING"] = 9] = "STRING";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["GROUP"] = 10] = "GROUP";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["MESSAGE"] = 11] = "MESSAGE";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["BYTES"] = 12] = "BYTES";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["UINT32"] = 13] = "UINT32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["ENUM"] = 14] = "ENUM";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SFIXED32"] = 15] = "SFIXED32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SFIXED64"] = 16] = "SFIXED64";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SINT32"] = 17] = "SINT32";
  FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SINT64"] = 18] = "SINT64";
})(FieldDescriptorProto_Type || (FieldDescriptorProto_Type = {}));
var FieldDescriptorProto_Label;
(function(FieldDescriptorProto_Label2) {
  FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["OPTIONAL"] = 1] = "OPTIONAL";
  FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["REPEATED"] = 3] = "REPEATED";
  FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["REQUIRED"] = 2] = "REQUIRED";
})(FieldDescriptorProto_Label || (FieldDescriptorProto_Label = {}));
var FileOptions_OptimizeMode;
(function(FileOptions_OptimizeMode2) {
  FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["SPEED"] = 1] = "SPEED";
  FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["CODE_SIZE"] = 2] = "CODE_SIZE";
  FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["LITE_RUNTIME"] = 3] = "LITE_RUNTIME";
})(FileOptions_OptimizeMode || (FileOptions_OptimizeMode = {}));
var FieldOptions_CType;
(function(FieldOptions_CType2) {
  FieldOptions_CType2[FieldOptions_CType2["STRING"] = 0] = "STRING";
  FieldOptions_CType2[FieldOptions_CType2["CORD"] = 1] = "CORD";
  FieldOptions_CType2[FieldOptions_CType2["STRING_PIECE"] = 2] = "STRING_PIECE";
})(FieldOptions_CType || (FieldOptions_CType = {}));
var FieldOptions_JSType;
(function(FieldOptions_JSType2) {
  FieldOptions_JSType2[FieldOptions_JSType2["JS_NORMAL"] = 0] = "JS_NORMAL";
  FieldOptions_JSType2[FieldOptions_JSType2["JS_STRING"] = 1] = "JS_STRING";
  FieldOptions_JSType2[FieldOptions_JSType2["JS_NUMBER"] = 2] = "JS_NUMBER";
})(FieldOptions_JSType || (FieldOptions_JSType = {}));
var FieldOptions_OptionRetention;
(function(FieldOptions_OptionRetention2) {
  FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_UNKNOWN"] = 0] = "RETENTION_UNKNOWN";
  FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_RUNTIME"] = 1] = "RETENTION_RUNTIME";
  FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_SOURCE"] = 2] = "RETENTION_SOURCE";
})(FieldOptions_OptionRetention || (FieldOptions_OptionRetention = {}));
var FieldOptions_OptionTargetType;
(function(FieldOptions_OptionTargetType2) {
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_UNKNOWN"] = 0] = "TARGET_TYPE_UNKNOWN";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_FILE"] = 1] = "TARGET_TYPE_FILE";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_EXTENSION_RANGE"] = 2] = "TARGET_TYPE_EXTENSION_RANGE";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_MESSAGE"] = 3] = "TARGET_TYPE_MESSAGE";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_FIELD"] = 4] = "TARGET_TYPE_FIELD";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ONEOF"] = 5] = "TARGET_TYPE_ONEOF";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ENUM"] = 6] = "TARGET_TYPE_ENUM";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ENUM_ENTRY"] = 7] = "TARGET_TYPE_ENUM_ENTRY";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_SERVICE"] = 8] = "TARGET_TYPE_SERVICE";
  FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_METHOD"] = 9] = "TARGET_TYPE_METHOD";
})(FieldOptions_OptionTargetType || (FieldOptions_OptionTargetType = {}));
var MethodOptions_IdempotencyLevel;
(function(MethodOptions_IdempotencyLevel2) {
  MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["IDEMPOTENCY_UNKNOWN"] = 0] = "IDEMPOTENCY_UNKNOWN";
  MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["NO_SIDE_EFFECTS"] = 1] = "NO_SIDE_EFFECTS";
  MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["IDEMPOTENT"] = 2] = "IDEMPOTENT";
})(MethodOptions_IdempotencyLevel || (MethodOptions_IdempotencyLevel = {}));
var FeatureSet_VisibilityFeature_DefaultSymbolVisibility;
(function(FeatureSet_VisibilityFeature_DefaultSymbolVisibility2) {
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["DEFAULT_SYMBOL_VISIBILITY_UNKNOWN"] = 0] = "DEFAULT_SYMBOL_VISIBILITY_UNKNOWN";
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["EXPORT_ALL"] = 1] = "EXPORT_ALL";
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["EXPORT_TOP_LEVEL"] = 2] = "EXPORT_TOP_LEVEL";
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["LOCAL_ALL"] = 3] = "LOCAL_ALL";
  FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["STRICT"] = 4] = "STRICT";
})(FeatureSet_VisibilityFeature_DefaultSymbolVisibility || (FeatureSet_VisibilityFeature_DefaultSymbolVisibility = {}));
var FeatureSet_FieldPresence;
(function(FeatureSet_FieldPresence2) {
  FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["FIELD_PRESENCE_UNKNOWN"] = 0] = "FIELD_PRESENCE_UNKNOWN";
  FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["EXPLICIT"] = 1] = "EXPLICIT";
  FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["IMPLICIT"] = 2] = "IMPLICIT";
  FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["LEGACY_REQUIRED"] = 3] = "LEGACY_REQUIRED";
})(FeatureSet_FieldPresence || (FeatureSet_FieldPresence = {}));
var FeatureSet_EnumType;
(function(FeatureSet_EnumType2) {
  FeatureSet_EnumType2[FeatureSet_EnumType2["ENUM_TYPE_UNKNOWN"] = 0] = "ENUM_TYPE_UNKNOWN";
  FeatureSet_EnumType2[FeatureSet_EnumType2["OPEN"] = 1] = "OPEN";
  FeatureSet_EnumType2[FeatureSet_EnumType2["CLOSED"] = 2] = "CLOSED";
})(FeatureSet_EnumType || (FeatureSet_EnumType = {}));
var FeatureSet_RepeatedFieldEncoding;
(function(FeatureSet_RepeatedFieldEncoding2) {
  FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["REPEATED_FIELD_ENCODING_UNKNOWN"] = 0] = "REPEATED_FIELD_ENCODING_UNKNOWN";
  FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["PACKED"] = 1] = "PACKED";
  FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["EXPANDED"] = 2] = "EXPANDED";
})(FeatureSet_RepeatedFieldEncoding || (FeatureSet_RepeatedFieldEncoding = {}));
var FeatureSet_Utf8Validation;
(function(FeatureSet_Utf8Validation2) {
  FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["UTF8_VALIDATION_UNKNOWN"] = 0] = "UTF8_VALIDATION_UNKNOWN";
  FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["VERIFY"] = 2] = "VERIFY";
  FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["NONE"] = 3] = "NONE";
})(FeatureSet_Utf8Validation || (FeatureSet_Utf8Validation = {}));
var FeatureSet_MessageEncoding;
(function(FeatureSet_MessageEncoding2) {
  FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["MESSAGE_ENCODING_UNKNOWN"] = 0] = "MESSAGE_ENCODING_UNKNOWN";
  FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["LENGTH_PREFIXED"] = 1] = "LENGTH_PREFIXED";
  FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["DELIMITED"] = 2] = "DELIMITED";
})(FeatureSet_MessageEncoding || (FeatureSet_MessageEncoding = {}));
var FeatureSet_JsonFormat;
(function(FeatureSet_JsonFormat2) {
  FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["JSON_FORMAT_UNKNOWN"] = 0] = "JSON_FORMAT_UNKNOWN";
  FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["ALLOW"] = 1] = "ALLOW";
  FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["LEGACY_BEST_EFFORT"] = 2] = "LEGACY_BEST_EFFORT";
})(FeatureSet_JsonFormat || (FeatureSet_JsonFormat = {}));
var FeatureSet_EnforceNamingStyle;
(function(FeatureSet_EnforceNamingStyle2) {
  FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["ENFORCE_NAMING_STYLE_UNKNOWN"] = 0] = "ENFORCE_NAMING_STYLE_UNKNOWN";
  FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["STYLE2024"] = 1] = "STYLE2024";
  FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["STYLE_LEGACY"] = 2] = "STYLE_LEGACY";
})(FeatureSet_EnforceNamingStyle || (FeatureSet_EnforceNamingStyle = {}));
var GeneratedCodeInfo_Annotation_Semantic;
(function(GeneratedCodeInfo_Annotation_Semantic2) {
  GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["NONE"] = 0] = "NONE";
  GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["SET"] = 1] = "SET";
  GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["ALIAS"] = 2] = "ALIAS";
})(GeneratedCodeInfo_Annotation_Semantic || (GeneratedCodeInfo_Annotation_Semantic = {}));
var Edition;
(function(Edition2) {
  Edition2[Edition2["EDITION_UNKNOWN"] = 0] = "EDITION_UNKNOWN";
  Edition2[Edition2["EDITION_LEGACY"] = 900] = "EDITION_LEGACY";
  Edition2[Edition2["EDITION_PROTO2"] = 998] = "EDITION_PROTO2";
  Edition2[Edition2["EDITION_PROTO3"] = 999] = "EDITION_PROTO3";
  Edition2[Edition2["EDITION_2023"] = 1e3] = "EDITION_2023";
  Edition2[Edition2["EDITION_2024"] = 1001] = "EDITION_2024";
  Edition2[Edition2["EDITION_1_TEST_ONLY"] = 1] = "EDITION_1_TEST_ONLY";
  Edition2[Edition2["EDITION_2_TEST_ONLY"] = 2] = "EDITION_2_TEST_ONLY";
  Edition2[Edition2["EDITION_99997_TEST_ONLY"] = 99997] = "EDITION_99997_TEST_ONLY";
  Edition2[Edition2["EDITION_99998_TEST_ONLY"] = 99998] = "EDITION_99998_TEST_ONLY";
  Edition2[Edition2["EDITION_99999_TEST_ONLY"] = 99999] = "EDITION_99999_TEST_ONLY";
  Edition2[Edition2["EDITION_MAX"] = 2147483647] = "EDITION_MAX";
})(Edition || (Edition = {}));
var SymbolVisibility;
(function(SymbolVisibility2) {
  SymbolVisibility2[SymbolVisibility2["VISIBILITY_UNSET"] = 0] = "VISIBILITY_UNSET";
  SymbolVisibility2[SymbolVisibility2["VISIBILITY_LOCAL"] = 1] = "VISIBILITY_LOCAL";
  SymbolVisibility2[SymbolVisibility2["VISIBILITY_EXPORT"] = 2] = "VISIBILITY_EXPORT";
})(SymbolVisibility || (SymbolVisibility = {}));

// node_modules/@bufbuild/protobuf/dist/esm/from-binary.js
var readDefaults = {
  readUnknownFields: true
};
function makeReadOptions(options) {
  return options ? Object.assign(Object.assign({}, readDefaults), options) : readDefaults;
}
function fromBinary(schema, bytes, options) {
  const msg = reflect(schema, void 0, false);
  readMessage(msg, new BinaryReader(bytes), makeReadOptions(options), false, bytes.byteLength);
  return msg.message;
}
function readMessage(message, reader, options, delimited, lengthOrDelimitedFieldNo) {
  var _a;
  const end = delimited ? reader.len : reader.pos + lengthOrDelimitedFieldNo;
  let fieldNo;
  let wireType;
  const unknownFields = (_a = message.getUnknown()) !== null && _a !== void 0 ? _a : [];
  while (reader.pos < end) {
    [fieldNo, wireType] = reader.tag();
    if (delimited && wireType == WireType.EndGroup) {
      break;
    }
    const field = message.findNumber(fieldNo);
    if (!field) {
      const data = reader.skip(wireType, fieldNo);
      if (options.readUnknownFields) {
        unknownFields.push({ no: fieldNo, wireType, data });
      }
      continue;
    }
    readField(message, reader, field, wireType, options);
  }
  if (delimited) {
    if (wireType != WireType.EndGroup || fieldNo !== lengthOrDelimitedFieldNo) {
      throw new Error("invalid end group tag");
    }
  }
  if (unknownFields.length > 0) {
    message.setUnknown(unknownFields);
  }
}
function readField(message, reader, field, wireType, options) {
  var _a;
  switch (field.fieldKind) {
    case "scalar":
      message.set(field, readScalar(reader, field.scalar));
      break;
    case "enum":
      const val = readScalar(reader, ScalarType.INT32);
      if (field.enum.open) {
        message.set(field, val);
      } else {
        const ok = field.enum.values.some((v) => v.number === val);
        if (ok) {
          message.set(field, val);
        } else if (options.readUnknownFields) {
          const bytes = [];
          varint32write(val, bytes);
          const unknownFields = (_a = message.getUnknown()) !== null && _a !== void 0 ? _a : [];
          unknownFields.push({
            no: field.number,
            wireType,
            data: new Uint8Array(bytes)
          });
          message.setUnknown(unknownFields);
        }
      }
      break;
    case "message":
      message.set(field, readMessageField(reader, options, field, message.get(field)));
      break;
    case "list":
      readListField(reader, wireType, message.get(field), options);
      break;
    case "map":
      readMapEntry(reader, message.get(field), options);
      break;
  }
}
function readMapEntry(reader, map, options) {
  const field = map.field();
  let key;
  let val;
  const len = reader.uint32();
  const end = reader.pos + len;
  while (reader.pos < end) {
    const [fieldNo] = reader.tag();
    switch (fieldNo) {
      case 1:
        key = readScalar(reader, field.mapKey);
        break;
      case 2:
        switch (field.mapKind) {
          case "scalar":
            val = readScalar(reader, field.scalar);
            break;
          case "enum":
            val = reader.int32();
            break;
          case "message":
            val = readMessageField(reader, options, field);
            break;
        }
        break;
    }
  }
  if (key === void 0) {
    key = scalarZeroValue(field.mapKey, false);
  }
  if (val === void 0) {
    switch (field.mapKind) {
      case "scalar":
        val = scalarZeroValue(field.scalar, false);
        break;
      case "enum":
        val = field.enum.values[0].number;
        break;
      case "message":
        val = reflect(field.message, void 0, false);
        break;
    }
  }
  map.set(key, val);
}
function readListField(reader, wireType, list, options) {
  var _a;
  const field = list.field();
  if (field.listKind === "message") {
    list.add(readMessageField(reader, options, field));
    return;
  }
  const scalarType = (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32;
  const packed = wireType == WireType.LengthDelimited && scalarType != ScalarType.STRING && scalarType != ScalarType.BYTES;
  if (!packed) {
    list.add(readScalar(reader, scalarType));
    return;
  }
  const e = reader.uint32() + reader.pos;
  while (reader.pos < e) {
    list.add(readScalar(reader, scalarType));
  }
}
function readMessageField(reader, options, field, mergeMessage) {
  const delimited = field.delimitedEncoding;
  const message = mergeMessage !== null && mergeMessage !== void 0 ? mergeMessage : reflect(field.message, void 0, false);
  readMessage(message, reader, options, delimited, delimited ? field.number : reader.uint32());
  return message;
}
function readScalar(reader, type) {
  switch (type) {
    case ScalarType.STRING:
      return reader.string();
    case ScalarType.BOOL:
      return reader.bool();
    case ScalarType.DOUBLE:
      return reader.double();
    case ScalarType.FLOAT:
      return reader.float();
    case ScalarType.INT32:
      return reader.int32();
    case ScalarType.INT64:
      return reader.int64();
    case ScalarType.UINT64:
      return reader.uint64();
    case ScalarType.FIXED64:
      return reader.fixed64();
    case ScalarType.BYTES:
      return reader.bytes();
    case ScalarType.FIXED32:
      return reader.fixed32();
    case ScalarType.SFIXED32:
      return reader.sfixed32();
    case ScalarType.SFIXED64:
      return reader.sfixed64();
    case ScalarType.SINT64:
      return reader.sint64();
    case ScalarType.UINT32:
      return reader.uint32();
    case ScalarType.SINT32:
      return reader.sint32();
  }
}

// node_modules/@bufbuild/protobuf/dist/esm/codegenv2/file.js
function fileDesc(b64, imports) {
  var _a;
  const root = fromBinary(FileDescriptorProtoSchema, base64Decode(b64));
  root.messageType.forEach(restoreJsonNames);
  root.dependency = (_a = imports === null || imports === void 0 ? void 0 : imports.map((f) => f.proto.name)) !== null && _a !== void 0 ? _a : [];
  const reg = createFileRegistry(root, (protoFileName) => imports === null || imports === void 0 ? void 0 : imports.find((f) => f.proto.name === protoFileName));
  return reg.getFile(root.name);
}

// node_modules/@bufbuild/protobuf/dist/esm/to-binary.js
var LEGACY_REQUIRED2 = 3;
var writeDefaults = {
  writeUnknownFields: true
};
function makeWriteOptions(options) {
  return options ? Object.assign(Object.assign({}, writeDefaults), options) : writeDefaults;
}
function toBinary(schema, message, options) {
  return writeFields(new BinaryWriter(), makeWriteOptions(options), reflect(schema, message)).finish();
}
function writeFields(writer, opts, msg) {
  var _a;
  for (const f of msg.sortedFields) {
    if (!msg.isSet(f)) {
      if (f.presence == LEGACY_REQUIRED2) {
        throw new Error(`cannot encode ${f} to binary: required field not set`);
      }
      continue;
    }
    writeField(writer, opts, msg, f);
  }
  if (opts.writeUnknownFields) {
    for (const { no, wireType, data } of (_a = msg.getUnknown()) !== null && _a !== void 0 ? _a : []) {
      writer.tag(no, wireType).raw(data);
    }
  }
  return writer;
}
function writeField(writer, opts, msg, field) {
  var _a;
  switch (field.fieldKind) {
    case "scalar":
    case "enum":
      writeScalar(writer, msg.desc.typeName, field.name, (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32, field.number, msg.get(field));
      break;
    case "list":
      writeListField(writer, opts, field, msg.get(field));
      break;
    case "message":
      writeMessageField(writer, opts, field, msg.get(field));
      break;
    case "map":
      for (const [key, val] of msg.get(field)) {
        writeMapEntry(writer, opts, field, key, val);
      }
      break;
  }
}
function writeScalar(writer, msgName, fieldName, scalarType, fieldNo, value) {
  writeScalarValue(writer.tag(fieldNo, writeTypeOfScalar(scalarType)), msgName, fieldName, scalarType, value);
}
function writeMessageField(writer, opts, field, message) {
  if (field.delimitedEncoding) {
    writeFields(writer.tag(field.number, WireType.StartGroup), opts, message).tag(field.number, WireType.EndGroup);
  } else {
    writeFields(writer.tag(field.number, WireType.LengthDelimited).fork(), opts, message).join();
  }
}
function writeListField(writer, opts, field, list) {
  var _a;
  if (field.listKind == "message") {
    for (const item of list) {
      writeMessageField(writer, opts, field, item);
    }
    return;
  }
  const scalarType = (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32;
  if (field.packed) {
    if (!list.size) {
      return;
    }
    writer.tag(field.number, WireType.LengthDelimited).fork();
    for (const item of list) {
      writeScalarValue(writer, field.parent.typeName, field.name, scalarType, item);
    }
    writer.join();
    return;
  }
  for (const item of list) {
    writeScalar(writer, field.parent.typeName, field.name, scalarType, field.number, item);
  }
}
function writeMapEntry(writer, opts, field, key, value) {
  var _a;
  writer.tag(field.number, WireType.LengthDelimited).fork();
  writeScalar(writer, field.parent.typeName, field.name, field.mapKey, 1, key);
  switch (field.mapKind) {
    case "scalar":
    case "enum":
      writeScalar(writer, field.parent.typeName, field.name, (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32, 2, value);
      break;
    case "message":
      writeFields(writer.tag(2, WireType.LengthDelimited).fork(), opts, value).join();
      break;
  }
  writer.join();
}
function writeScalarValue(writer, msgName, fieldName, type, value) {
  try {
    switch (type) {
      case ScalarType.STRING:
        writer.string(value);
        break;
      case ScalarType.BOOL:
        writer.bool(value);
        break;
      case ScalarType.DOUBLE:
        writer.double(value);
        break;
      case ScalarType.FLOAT:
        writer.float(value);
        break;
      case ScalarType.INT32:
        writer.int32(value);
        break;
      case ScalarType.INT64:
        writer.int64(value);
        break;
      case ScalarType.UINT64:
        writer.uint64(value);
        break;
      case ScalarType.FIXED64:
        writer.fixed64(value);
        break;
      case ScalarType.BYTES:
        writer.bytes(value);
        break;
      case ScalarType.FIXED32:
        writer.fixed32(value);
        break;
      case ScalarType.SFIXED32:
        writer.sfixed32(value);
        break;
      case ScalarType.SFIXED64:
        writer.sfixed64(value);
        break;
      case ScalarType.SINT64:
        writer.sint64(value);
        break;
      case ScalarType.UINT32:
        writer.uint32(value);
        break;
      case ScalarType.SINT32:
        writer.sint32(value);
        break;
    }
  } catch (e) {
    if (e instanceof Error) {
      throw new Error(`cannot encode field ${msgName}.${fieldName} to binary: ${e.message}`);
    }
    throw e;
  }
}
function writeTypeOfScalar(type) {
  switch (type) {
    case ScalarType.BYTES:
    case ScalarType.STRING:
      return WireType.LengthDelimited;
    case ScalarType.DOUBLE:
    case ScalarType.FIXED64:
    case ScalarType.SFIXED64:
      return WireType.Bit64;
    case ScalarType.FIXED32:
    case ScalarType.SFIXED32:
    case ScalarType.FLOAT:
      return WireType.Bit32;
    default:
      return WireType.Varint;
  }
}

// vendor/cpsat-js/dist/generated/cp_model_pb.js
var file_cp_model = /* @__PURE__ */ fileDesc("Cg5jcF9tb2RlbC5wcm90bxIXb3BlcmF0aW9uc19yZXNlYXJjaC5zYXQiNAoUSW50ZWdlclZhcmlhYmxlUHJvdG8SDAoEbmFtZRgBIAEoCRIOCgZkb21haW4YAiADKAMiJQoRQm9vbEFyZ3VtZW50UHJvdG8SEAoIbGl0ZXJhbHMYASADKAUiRQoVTGluZWFyRXhwcmVzc2lvblByb3RvEgwKBHZhcnMYASADKAUSDgoGY29lZmZzGAIgAygDEg4KBm9mZnNldBgDIAEoAyKUAQoTTGluZWFyQXJndW1lbnRQcm90bxI+CgZ0YXJnZXQYASABKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SPQoFZXhwcnMYAiADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8iXAobQWxsRGlmZmVyZW50Q29uc3RyYWludFByb3RvEj0KBWV4cHJzGAEgAygLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvIkUKFUxpbmVhckNvbnN0cmFpbnRQcm90bxIMCgR2YXJzGAEgAygFEg4KBmNvZWZmcxgCIAMoAxIOCgZkb21haW4YAyADKAMikQIKFkVsZW1lbnRDb25zdHJhaW50UHJvdG8SDQoFaW5kZXgYASABKAUSDgoGdGFyZ2V0GAIgASgFEgwKBHZhcnMYAyADKAUSRAoMbGluZWFyX2luZGV4GAQgASgLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvEkUKDWxpbmVhcl90YXJnZXQYBSABKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SPQoFZXhwcnMYBiADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8i0wEKF0ludGVydmFsQ29uc3RyYWludFByb3RvEj0KBXN0YXJ0GAQgASgLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvEjsKA2VuZBgFIAEoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckV4cHJlc3Npb25Qcm90bxI8CgRzaXplGAYgASgLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvIi0KGE5vT3ZlcmxhcENvbnN0cmFpbnRQcm90bxIRCglpbnRlcnZhbHMYASADKAUiRgoaTm9PdmVybGFwMkRDb25zdHJhaW50UHJvdG8SEwoLeF9pbnRlcnZhbHMYASADKAUSEwoLeV9pbnRlcnZhbHMYAiADKAUisQEKGUN1bXVsYXRpdmVDb25zdHJhaW50UHJvdG8SQAoIY2FwYWNpdHkYASABKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SEQoJaW50ZXJ2YWxzGAIgAygFEj8KB2RlbWFuZHMYAyADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8i6gEKGFJlc2Vydm9pckNvbnN0cmFpbnRQcm90bxIRCgltaW5fbGV2ZWwYASABKAMSEQoJbWF4X2xldmVsGAIgASgDEkIKCnRpbWVfZXhwcnMYAyADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SRQoNbGV2ZWxfY2hhbmdlcxgGIAMoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckV4cHJlc3Npb25Qcm90bxIXCg9hY3RpdmVfbGl0ZXJhbHMYBSADKAVKBAgEEAUiSAoWQ2lyY3VpdENvbnN0cmFpbnRQcm90bxINCgV0YWlscxgDIAMoBRINCgVoZWFkcxgEIAMoBRIQCghsaXRlcmFscxgFIAMoBSKQAgoVUm91dGVzQ29uc3RyYWludFByb3RvEg0KBXRhaWxzGAEgAygFEg0KBWhlYWRzGAIgAygFEhAKCGxpdGVyYWxzGAMgAygFEg8KB2RlbWFuZHMYBCADKAUSEAoIY2FwYWNpdHkYBSABKAMSUgoKZGltZW5zaW9ucxgGIAMoCzI+Lm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlJvdXRlc0NvbnN0cmFpbnRQcm90by5Ob2RlRXhwcmVzc2lvbnMaUAoPTm9kZUV4cHJlc3Npb25zEj0KBWV4cHJzGAEgAygLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvIoQBChRUYWJsZUNvbnN0cmFpbnRQcm90bxIMCgR2YXJzGAEgAygFEg4KBnZhbHVlcxgCIAMoAxI9CgVleHBycxgEIAMoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckV4cHJlc3Npb25Qcm90bxIPCgduZWdhdGVkGAMgASgIIj0KFkludmVyc2VDb25zdHJhaW50UHJvdG8SEAoIZl9kaXJlY3QYASADKAUSEQoJZl9pbnZlcnNlGAIgAygFIuEBChhBdXRvbWF0b25Db25zdHJhaW50UHJvdG8SFgoOc3RhcnRpbmdfc3RhdGUYAiABKAMSFAoMZmluYWxfc3RhdGVzGAMgAygDEhcKD3RyYW5zaXRpb25fdGFpbBgEIAMoAxIXCg90cmFuc2l0aW9uX2hlYWQYBSADKAMSGAoQdHJhbnNpdGlvbl9sYWJlbBgGIAMoAxIMCgR2YXJzGAcgAygFEj0KBWV4cHJzGAggAygLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyRXhwcmVzc2lvblByb3RvIiQKFExpc3RPZlZhcmlhYmxlc1Byb3RvEgwKBHZhcnMYASADKAUi8AwKD0NvbnN0cmFpbnRQcm90bxIMCgRuYW1lGAEgASgJEhsKE2VuZm9yY2VtZW50X2xpdGVyYWwYAiADKAUSPQoHYm9vbF9vchgDIAEoCzIqLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkJvb2xBcmd1bWVudFByb3RvSAASPgoIYm9vbF9hbmQYBCABKAsyKi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5Cb29sQXJndW1lbnRQcm90b0gAEkEKC2F0X21vc3Rfb25lGBogASgLMioub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuQm9vbEFyZ3VtZW50UHJvdG9IABJBCgtleGFjdGx5X29uZRgdIAEoCzIqLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkJvb2xBcmd1bWVudFByb3RvSAASPgoIYm9vbF94b3IYBSABKAsyKi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5Cb29sQXJndW1lbnRQcm90b0gAEj8KB2ludF9kaXYYByABKAsyLC5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJBcmd1bWVudFByb3RvSAASPwoHaW50X21vZBgIIAEoCzIsLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckFyZ3VtZW50UHJvdG9IABJACghpbnRfcHJvZBgLIAEoCzIsLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckFyZ3VtZW50UHJvdG9IABI/CgdsaW5fbWF4GBsgASgLMiwub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGluZWFyQXJndW1lbnRQcm90b0gAEkAKBmxpbmVhchgMIAEoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkxpbmVhckNvbnN0cmFpbnRQcm90b0gAEkgKCGFsbF9kaWZmGA0gASgLMjQub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuQWxsRGlmZmVyZW50Q29uc3RyYWludFByb3RvSAASQgoHZWxlbWVudBgOIAEoCzIvLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkVsZW1lbnRDb25zdHJhaW50UHJvdG9IABJCCgdjaXJjdWl0GA8gASgLMi8ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuQ2lyY3VpdENvbnN0cmFpbnRQcm90b0gAEkAKBnJvdXRlcxgXIAEoCzIuLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlJvdXRlc0NvbnN0cmFpbnRQcm90b0gAEj4KBXRhYmxlGBAgASgLMi0ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuVGFibGVDb25zdHJhaW50UHJvdG9IABJGCglhdXRvbWF0b24YESABKAsyMS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5BdXRvbWF0b25Db25zdHJhaW50UHJvdG9IABJCCgdpbnZlcnNlGBIgASgLMi8ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuSW52ZXJzZUNvbnN0cmFpbnRQcm90b0gAEkYKCXJlc2Vydm9pchgYIAEoCzIxLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlJlc2Vydm9pckNvbnN0cmFpbnRQcm90b0gAEkQKCGludGVydmFsGBMgASgLMjAub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuSW50ZXJ2YWxDb25zdHJhaW50UHJvdG9IABJHCgpub19vdmVybGFwGBQgASgLMjEub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTm9PdmVybGFwQ29uc3RyYWludFByb3RvSAASTAoNbm9fb3ZlcmxhcF8yZBgVIAEoCzIzLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0Lk5vT3ZlcmxhcDJEQ29uc3RyYWludFByb3RvSAASSAoKY3VtdWxhdGl2ZRgWIAEoCzIyLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkN1bXVsYXRpdmVDb25zdHJhaW50UHJvdG9IABJJChBkdW1teV9jb25zdHJhaW50GB4gASgLMi0ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuTGlzdE9mVmFyaWFibGVzUHJvdG9IAEIMCgpjb25zdHJhaW50IuABChBDcE9iamVjdGl2ZVByb3RvEgwKBHZhcnMYASADKAUSDgoGY29lZmZzGAQgAygDEg4KBm9mZnNldBgCIAEoARIWCg5zY2FsaW5nX2ZhY3RvchgDIAEoARIOCgZkb21haW4YBSADKAMSGQoRc2NhbGluZ193YXNfZXhhY3QYBiABKAgSHQoVaW50ZWdlcl9iZWZvcmVfb2Zmc2V0GAcgASgDEhwKFGludGVnZXJfYWZ0ZXJfb2Zmc2V0GAkgASgDEh4KFmludGVnZXJfc2NhbGluZ19mYWN0b3IYCCABKAMiVQoTRmxvYXRPYmplY3RpdmVQcm90bxIMCgR2YXJzGAEgAygFEg4KBmNvZWZmcxgCIAMoARIOCgZvZmZzZXQYAyABKAESEAoIbWF4aW1pemUYBCABKAgigQUKFURlY2lzaW9uU3RyYXRlZ3lQcm90bxIRCgl2YXJpYWJsZXMYASADKAUSPQoFZXhwcnMYBSADKAsyLi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5MaW5lYXJFeHByZXNzaW9uUHJvdG8SbQobdmFyaWFibGVfc2VsZWN0aW9uX3N0cmF0ZWd5GAIgASgOMkgub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuRGVjaXNpb25TdHJhdGVneVByb3RvLlZhcmlhYmxlU2VsZWN0aW9uU3RyYXRlZ3kSaQoZZG9tYWluX3JlZHVjdGlvbl9zdHJhdGVneRgDIAEoDjJGLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkRlY2lzaW9uU3RyYXRlZ3lQcm90by5Eb21haW5SZWR1Y3Rpb25TdHJhdGVneSKUAQoZVmFyaWFibGVTZWxlY3Rpb25TdHJhdGVneRIQCgxDSE9PU0VfRklSU1QQABIVChFDSE9PU0VfTE9XRVNUX01JThABEhYKEkNIT09TRV9ISUdIRVNUX01BWBACEhoKFkNIT09TRV9NSU5fRE9NQUlOX1NJWkUQAxIaChZDSE9PU0VfTUFYX0RPTUFJTl9TSVpFEAQipAEKF0RvbWFpblJlZHVjdGlvblN0cmF0ZWd5EhQKEFNFTEVDVF9NSU5fVkFMVUUQABIUChBTRUxFQ1RfTUFYX1ZBTFVFEAESFQoRU0VMRUNUX0xPV0VSX0hBTEYQAhIVChFTRUxFQ1RfVVBQRVJfSEFMRhADEhcKE1NFTEVDVF9NRURJQU5fVkFMVUUQBBIWChJTRUxFQ1RfUkFORE9NX0hBTEYQBSI5ChlQYXJ0aWFsVmFyaWFibGVBc3NpZ25tZW50EgwKBHZhcnMYASADKAUSDgoGdmFsdWVzGAIgAygDIj4KFlNwYXJzZVBlcm11dGF0aW9uUHJvdG8SDwoHc3VwcG9ydBgBIAMoBRITCgtjeWNsZV9zaXplcxgCIAMoBSJHChBEZW5zZU1hdHJpeFByb3RvEhAKCG51bV9yb3dzGAEgASgFEhAKCG51bV9jb2xzGAIgASgFEg8KB2VudHJpZXMYAyADKAUilAEKDVN5bW1ldHJ5UHJvdG8SRQoMcGVybXV0YXRpb25zGAEgAygLMi8ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU3BhcnNlUGVybXV0YXRpb25Qcm90bxI8CglvcmJpdG9wZXMYAiADKAsyKS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5EZW5zZU1hdHJpeFByb3RvIo4ECgxDcE1vZGVsUHJvdG8SDAoEbmFtZRgBIAEoCRJACgl2YXJpYWJsZXMYAiADKAsyLS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5JbnRlZ2VyVmFyaWFibGVQcm90bxI9Cgtjb25zdHJhaW50cxgDIAMoCzIoLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkNvbnN0cmFpbnRQcm90bxI8CglvYmplY3RpdmUYBCABKAsyKS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5DcE9iamVjdGl2ZVByb3RvEk4KGGZsb2F0aW5nX3BvaW50X29iamVjdGl2ZRgJIAEoCzIsLm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LkZsb2F0T2JqZWN0aXZlUHJvdG8SRwoPc2VhcmNoX3N0cmF0ZWd5GAUgAygLMi4ub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuRGVjaXNpb25TdHJhdGVneVByb3RvEkkKDXNvbHV0aW9uX2hpbnQYBiABKAsyMi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5QYXJ0aWFsVmFyaWFibGVBc3NpZ25tZW50EhMKC2Fzc3VtcHRpb25zGAcgAygFEjgKCHN5bW1ldHJ5GAggASgLMiYub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU3ltbWV0cnlQcm90byIiChBDcFNvbHZlclNvbHV0aW9uEg4KBnZhbHVlcxgBIAMoAyKxBgoQQ3BTb2x2ZXJSZXNwb25zZRI3CgZzdGF0dXMYASABKA4yJy5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5DcFNvbHZlclN0YXR1cxIQCghzb2x1dGlvbhgCIAMoAxIXCg9vYmplY3RpdmVfdmFsdWUYAyABKAESHAoUYmVzdF9vYmplY3RpdmVfYm91bmQYBCABKAESRwoUYWRkaXRpb25hbF9zb2x1dGlvbnMYGyADKAsyKS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5DcFNvbHZlclNvbHV0aW9uEkoKE3RpZ2h0ZW5lZF92YXJpYWJsZXMYFSADKAsyLS5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5JbnRlZ2VyVmFyaWFibGVQcm90bxIwCihzdWZmaWNpZW50X2Fzc3VtcHRpb25zX2Zvcl9pbmZlYXNpYmlsaXR5GBcgAygFEkQKEWludGVnZXJfb2JqZWN0aXZlGBwgASgLMikub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuQ3BPYmplY3RpdmVQcm90bxIjChtpbm5lcl9vYmplY3RpdmVfbG93ZXJfYm91bmQYHSABKAMSFAoMbnVtX2ludGVnZXJzGB4gASgDEhQKDG51bV9ib29sZWFucxgKIAEoAxIaChJudW1fZml4ZWRfYm9vbGVhbnMYHyABKAMSFQoNbnVtX2NvbmZsaWN0cxgLIAEoAxIUCgxudW1fYnJhbmNoZXMYDCABKAMSHwoXbnVtX2JpbmFyeV9wcm9wYWdhdGlvbnMYDSABKAMSIAoYbnVtX2ludGVnZXJfcHJvcGFnYXRpb25zGA4gASgDEhQKDG51bV9yZXN0YXJ0cxgYIAEoAxIZChFudW1fbHBfaXRlcmF0aW9ucxgZIAEoAxIRCgl3YWxsX3RpbWUYDyABKAESEQoJdXNlcl90aW1lGBAgASgBEhoKEmRldGVybWluaXN0aWNfdGltZRgRIAEoARIUCgxnYXBfaW50ZWdyYWwYFiABKAESFQoNc29sdXRpb25faW5mbxgUIAEoCRIRCglzb2x2ZV9sb2cYGiABKAkqWwoOQ3BTb2x2ZXJTdGF0dXMSCwoHVU5LTk9XThAAEhEKDU1PREVMX0lOVkFMSUQQARIMCghGRUFTSUJMRRACEg4KCklORkVBU0lCTEUQAxILCgdPUFRJTUFMEARCdgoWY29tLmdvb2dsZS5vcnRvb2xzLnNhdEIPQ3BNb2RlbFByb3RvYnVmUAFaNGdpdGh1Yi5jb20vZ29vZ2xlL29yLXRvb2xzL29ydG9vbHMvc2F0L3Byb3RvL2NwbW9kZWyqAhJHb29nbGUuT3JUb29scy5TYXRiBnByb3RvMw");
var IntegerVariableProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 0);
var BoolArgumentProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 1);
var LinearExpressionProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 2);
var AllDifferentConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 4);
var LinearConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 5);
var IntervalConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 7);
var NoOverlapConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 8);
var CircuitConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 12);
var ConstraintProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 18);
var CpObjectiveProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 19);
var DecisionStrategyProto_VariableSelectionStrategy;
(function(DecisionStrategyProto_VariableSelectionStrategy2) {
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_FIRST"] = 0] = "CHOOSE_FIRST";
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_LOWEST_MIN"] = 1] = "CHOOSE_LOWEST_MIN";
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_HIGHEST_MAX"] = 2] = "CHOOSE_HIGHEST_MAX";
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_MIN_DOMAIN_SIZE"] = 3] = "CHOOSE_MIN_DOMAIN_SIZE";
  DecisionStrategyProto_VariableSelectionStrategy2[DecisionStrategyProto_VariableSelectionStrategy2["CHOOSE_MAX_DOMAIN_SIZE"] = 4] = "CHOOSE_MAX_DOMAIN_SIZE";
})(DecisionStrategyProto_VariableSelectionStrategy || (DecisionStrategyProto_VariableSelectionStrategy = {}));
var DecisionStrategyProto_DomainReductionStrategy;
(function(DecisionStrategyProto_DomainReductionStrategy2) {
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_MIN_VALUE"] = 0] = "SELECT_MIN_VALUE";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_MAX_VALUE"] = 1] = "SELECT_MAX_VALUE";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_LOWER_HALF"] = 2] = "SELECT_LOWER_HALF";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_UPPER_HALF"] = 3] = "SELECT_UPPER_HALF";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_MEDIAN_VALUE"] = 4] = "SELECT_MEDIAN_VALUE";
  DecisionStrategyProto_DomainReductionStrategy2[DecisionStrategyProto_DomainReductionStrategy2["SELECT_RANDOM_HALF"] = 5] = "SELECT_RANDOM_HALF";
})(DecisionStrategyProto_DomainReductionStrategy || (DecisionStrategyProto_DomainReductionStrategy = {}));
var PartialVariableAssignmentSchema = /* @__PURE__ */ messageDesc(file_cp_model, 22);
var CpModelProtoSchema = /* @__PURE__ */ messageDesc(file_cp_model, 26);
var CpSolverResponseSchema = /* @__PURE__ */ messageDesc(file_cp_model, 28);
var CpSolverStatus;
(function(CpSolverStatus2) {
  CpSolverStatus2[CpSolverStatus2["UNKNOWN"] = 0] = "UNKNOWN";
  CpSolverStatus2[CpSolverStatus2["MODEL_INVALID"] = 1] = "MODEL_INVALID";
  CpSolverStatus2[CpSolverStatus2["FEASIBLE"] = 2] = "FEASIBLE";
  CpSolverStatus2[CpSolverStatus2["INFEASIBLE"] = 3] = "INFEASIBLE";
  CpSolverStatus2[CpSolverStatus2["OPTIMAL"] = 4] = "OPTIMAL";
})(CpSolverStatus || (CpSolverStatus = {}));

// vendor/cpsat-js/dist/generated/sat_parameters_pb.js
var file_sat_parameters = /* @__PURE__ */ fileDesc("ChRzYXRfcGFyYW1ldGVycy5wcm90bxIXb3BlcmF0aW9uc19yZXNlYXJjaC5zYXQinHUKDVNhdFBhcmFtZXRlcnMSDwoEbmFtZRirASABKAk6ABJgChhwcmVmZXJyZWRfdmFyaWFibGVfb3JkZXIYASABKA4yNC5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzLlZhcmlhYmxlT3JkZXI6CElOX09SREVSElkKEGluaXRpYWxfcG9sYXJpdHkYAiABKA4yLy5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzLlBvbGFyaXR5Og5QT0xBUklUWV9GQUxTRRIeChB1c2VfcGhhc2Vfc2F2aW5nGCwgASgIOgR0cnVlEikKGnBvbGFyaXR5X3JlcGhhc2VfaW5jcmVtZW50GKgBIAEoBToEMTAwMBIpChlwb2xhcml0eV9leHBsb2l0X2xzX2hpbnRzGLUCIAEoCDoFZmFsc2USIAoVcmFuZG9tX3BvbGFyaXR5X3JhdGlvGC0gASgBOgEwEiAKFXJhbmRvbV9icmFuY2hlc19yYXRpbxggIAEoAToBMBIhChJ1c2VfZXJ3YV9oZXVyaXN0aWMYSyABKAg6BWZhbHNlEiUKGmluaXRpYWxfdmFyaWFibGVzX2FjdGl2aXR5GEwgASgBOgEwEjYKJ2Fsc29fYnVtcF92YXJpYWJsZXNfaW5fY29uZmxpY3RfcmVhc29ucxhNIAEoCDoFZmFsc2USbwoWbWluaW1pemF0aW9uX2FsZ29yaXRobRgEIAEoDjJELm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlNhdFBhcmFtZXRlcnMuQ29uZmxpY3RNaW5pbWl6YXRpb25BbGdvcml0aG06CVJFQ1VSU0lWRRKTAQodYmluYXJ5X21pbmltaXphdGlvbl9hbGdvcml0aG0YIiABKA4yQC5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzLkJpbmFyeU1pbml6YXRpb25BbGdvcml0aG06KkJJTkFSWV9NSU5JTUlaQVRJT05fRlJPTV9VSVBfQU5EX0RFQ0lTSU9OUxIyCiRzdWJzdW1wdGlvbl9kdXJpbmdfY29uZmxpY3RfYW5hbHlzaXMYOCABKAg6BHRydWUSOQoqZXh0cmFfc3Vic3VtcHRpb25fZHVyaW5nX2NvbmZsaWN0X2FuYWx5c2lzGN8CIAEoCDoEdHJ1ZRI8Ci1kZWNpc2lvbl9zdWJzdW1wdGlvbl9kdXJpbmdfY29uZmxpY3RfYW5hbHlzaXMY4QIgASgIOgR0cnVlEiwKIGVhZ2VybHlfc3Vic3VtZV9sYXN0X25fY29uZmxpY3RzGNcCIAEoBToBNBIqChtzdWJzdW1lX2R1cmluZ192aXZpZmljYXRpb24Y4wIgASgIOgR0cnVlEi4KHnVzZV9jaHJvbm9sb2dpY2FsX2JhY2t0cmFja2luZxjKAiABKAg6BWZhbHNlEiAKE21heF9iYWNranVtcF9sZXZlbHMYywIgASgFOgI1MBI0CiVjaHJvbm9sb2dpY2FsX2JhY2t0cmFja19taW5fY29uZmxpY3RzGMwCIAEoBToEMTAwMBIkChVjbGF1c2VfY2xlYW51cF9wZXJpb2QYCyABKAU6BTEwMDAwEisKH2NsYXVzZV9jbGVhbnVwX3BlcmlvZF9pbmNyZW1lbnQY0QIgASgFOgEwEiAKFWNsYXVzZV9jbGVhbnVwX3RhcmdldBgNIAEoBToBMBIiChRjbGF1c2VfY2xlYW51cF9yYXRpbxi+ASABKAE6AzAuNRIjChhjbGF1c2VfY2xlYW51cF9sYmRfYm91bmQYOyABKAU6ATUSJAoYY2xhdXNlX2NsZWFudXBfbGJkX3RpZXIxGN0CIAEoBToBMBIkChhjbGF1c2VfY2xlYW51cF9sYmRfdGllcjIY3gIgASgFOgEwEmcKF2NsYXVzZV9jbGVhbnVwX29yZGVyaW5nGDwgASgOMjUub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU2F0UGFyYW1ldGVycy5DbGF1c2VPcmRlcmluZzoPQ0xBVVNFX0FDVElWSVRZEiEKFHBiX2NsZWFudXBfaW5jcmVtZW50GC4gASgFOgMyMDASHQoQcGJfY2xlYW51cF9yYXRpbxgvIAEoAToDMC41EiQKF3ZhcmlhYmxlX2FjdGl2aXR5X2RlY2F5GA8gASgBOgMwLjgSKwobbWF4X3ZhcmlhYmxlX2FjdGl2aXR5X3ZhbHVlGBAgASgBOgYxZSsxMDASHwoRZ2x1Y29zZV9tYXhfZGVjYXkYFiABKAE6BDAuOTUSJQoXZ2x1Y29zZV9kZWNheV9pbmNyZW1lbnQYFyABKAE6BDAuMDESLAoeZ2x1Y29zZV9kZWNheV9pbmNyZW1lbnRfcGVyaW9kGBggASgFOgQ1MDAwEiQKFWNsYXVzZV9hY3Rpdml0eV9kZWNheRgRIAEoAToFMC45OTkSKAoZbWF4X2NsYXVzZV9hY3Rpdml0eV92YWx1ZRgSIAEoAToFMWUrMjASUwoScmVzdGFydF9hbGdvcml0aG1zGD0gAygOMjcub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU2F0UGFyYW1ldGVycy5SZXN0YXJ0QWxnb3JpdGhtEmUKGmRlZmF1bHRfcmVzdGFydF9hbGdvcml0aG1zGEYgASgJOkFMVUJZX1JFU1RBUlQsTEJEX01PVklOR19BVkVSQUdFX1JFU1RBUlQsRExfTU9WSU5HX0FWRVJBR0VfUkVTVEFSVBIaCg5yZXN0YXJ0X3BlcmlvZBgeIAEoBToCNTASJwobcmVzdGFydF9ydW5uaW5nX3dpbmRvd19zaXplGD4gASgFOgI1MBIjChhyZXN0YXJ0X2RsX2F2ZXJhZ2VfcmF0aW8YPyABKAE6ATESJAoZcmVzdGFydF9sYmRfYXZlcmFnZV9yYXRpbxhHIAEoAToBMRIjChR1c2VfYmxvY2tpbmdfcmVzdGFydBhAIAEoCDoFZmFsc2USKgocYmxvY2tpbmdfcmVzdGFydF93aW5kb3dfc2l6ZRhBIAEoBToENTAwMBIoChtibG9ja2luZ19yZXN0YXJ0X211bHRpcGxpZXIYQiABKAE6AzEuNBIwCiVudW1fY29uZmxpY3RzX2JlZm9yZV9zdHJhdGVneV9jaGFuZ2VzGEQgASgFOgEwEikKHnN0cmF0ZWd5X2NoYW5nZV9pbmNyZWFzZV9yYXRpbxhFIAEoAToBMBIgChNtYXhfdGltZV9pbl9zZWNvbmRzGCQgASgBOgNpbmYSIwoWbWF4X2RldGVybWluaXN0aWNfdGltZRhDIAEoAToDaW5mEikKHW1heF9udW1fZGV0ZXJtaW5pc3RpY19iYXRjaGVzGKMCIAEoBToBMBI0ChdtYXhfbnVtYmVyX29mX2NvbmZsaWN0cxglIAEoAzoTOTIyMzM3MjAzNjg1NDc3NTgwNxIfChBtYXhfbWVtb3J5X2luX21iGCggASgDOgUxMDAwMBIjChJhYnNvbHV0ZV9nYXBfbGltaXQYnwEgASgBOgYwLjAwMDESHgoScmVsYXRpdmVfZ2FwX2xpbWl0GKABIAEoAToBMBIWCgtyYW5kb21fc2VlZBgfIAEoBToBMRIpChlwZXJtdXRlX3ZhcmlhYmxlX3JhbmRvbWx5GLIBIAEoCDoFZmFsc2USMQohcGVybXV0ZV9wcmVzb2x2ZV9jb25zdHJhaW50X29yZGVyGLMBIAEoCDoFZmFsc2USHwoPdXNlX2Fic2xfcmFuZG9tGLQBIAEoCDoFZmFsc2USIgoTbG9nX3NlYXJjaF9wcm9ncmVzcxgpIAEoCDoFZmFsc2USKAoYbG9nX3N1YnNvbHZlcl9zdGF0aXN0aWNzGL0BIAEoCDoFZmFsc2USFQoKbG9nX3ByZWZpeBi5ASABKAk6ABIcCg1sb2dfdG9fc3Rkb3V0GLoBIAEoCDoEdHJ1ZRIfCg9sb2dfdG9fcmVzcG9uc2UYuwEgASgIOgVmYWxzZRIgChF1c2VfcGJfcmVzb2x1dGlvbhgrIAEoCDoFZmFsc2USNgonbWluaW1pemVfcmVkdWN0aW9uX2R1cmluZ19wYl9yZXNvbHV0aW9uGDAgASgIOgVmYWxzZRIsCh5jb3VudF9hc3N1bXB0aW9uX2xldmVsc19pbl9sYmQYMSABKAg6BHRydWUSIwoWcHJlc29sdmVfYnZlX3RocmVzaG9sZBg2IAEoBToDNTAwEiwKHGZpbHRlcl9zYXRfcG9zdHNvbHZlX2NsYXVzZXMYxAIgASgIOgVmYWxzZRIlChpwcmVzb2x2ZV9idmVfY2xhdXNlX3dlaWdodBg3IAEoBToBMxIsCiBwcm9iaW5nX2RldGVybWluaXN0aWNfdGltZV9saW1pdBjiASABKAE6ATESNQopcHJlc29sdmVfcHJvYmluZ19kZXRlcm1pbmlzdGljX3RpbWVfbGltaXQYOSABKAE6AjMwEiUKF3ByZXNvbHZlX2Jsb2NrZWRfY2xhdXNlGFggASgIOgR0cnVlEh4KEHByZXNvbHZlX3VzZV9idmEYSCABKAg6BHRydWUSIQoWcHJlc29sdmVfYnZhX3RocmVzaG9sZBhJIAEoBToBMRIjChdtYXhfcHJlc29sdmVfaXRlcmF0aW9ucxiKASABKAU6ATMSHwoRY3BfbW9kZWxfcHJlc29sdmUYViABKAg6BHRydWUSIQoWY3BfbW9kZWxfcHJvYmluZ19sZXZlbBhuIAEoBToBMhInChljcF9tb2RlbF91c2Vfc2F0X3ByZXNvbHZlGF0gASgIOgR0cnVlEjEKIWxvYWRfYXRfbW9zdF9vbmVzX2luX3NhdF9wcmVzb2x2ZRjPAiABKAg6BWZhbHNlEisKHHJlbW92ZV9maXhlZF92YXJpYWJsZXNfZWFybHkYtgIgASgIOgR0cnVlEiYKFmRldGVjdF90YWJsZV93aXRoX2Nvc3QY2AEgASgIOgVmYWxzZRIjChd0YWJsZV9jb21wcmVzc2lvbl9sZXZlbBjZASABKAU6ATISKgoaZXhwYW5kX2FsbGRpZmZfY29uc3RyYWludHMYqgEgASgIOgVmYWxzZRIlChdtYXhfYWxsZGlmZl9kb21haW5fc2l6ZRjAAiABKAU6AzI1NhIrChxleHBhbmRfcmVzZXJ2b2lyX2NvbnN0cmFpbnRzGLYBIAEoCDoEdHJ1ZRIxCiVtYXhfZG9tYWluX3NpemVfZm9yX2xpbmVhcjJfZXhwYW5zaW9uGNQCIAEoBToBOBIuCh5leHBhbmRfcmVzZXJ2b2lyX3VzaW5nX2NpcmN1aXQYoAIgASgIOgVmYWxzZRIuCh5lbmNvZGVfY3VtdWxhdGl2ZV9hc19yZXNlcnZvaXIYnwIgASgIOgVmYWxzZRIqCh5tYXhfbGluX21heF9zaXplX2Zvcl9leHBhbnNpb24YmAIgASgFOgEwEiwKHGRpc2FibGVfY29uc3RyYWludF9leHBhbnNpb24YtQEgASgIOgVmYWxzZRI9Ci1lbmNvZGVfY29tcGxleF9saW5lYXJfY29uc3RyYWludF93aXRoX2ludGVnZXIY3wEgASgIOgVmYWxzZRIrChttZXJnZV9ub19vdmVybGFwX3dvcmtfbGltaXQYkQEgASgBOgUxZSsxMhIsChxtZXJnZV9hdF9tb3N0X29uZV93b3JrX2xpbWl0GJIBIAEoAToFMWUrMDgSJwobcHJlc29sdmVfc3Vic3RpdHV0aW9uX2xldmVsGJMBIAEoBToBMRI0CiRwcmVzb2x2ZV9leHRyYWN0X2ludGVnZXJfZW5mb3JjZW1lbnQYrgEgASgIOgVmYWxzZRIxCh1wcmVzb2x2ZV9pbmNsdXNpb25fd29ya19saW1pdBjJASABKAM6CTEwMDAwMDAwMBIbCgxpZ25vcmVfbmFtZXMYygEgASgIOgR0cnVlEh4KD2luZmVyX2FsbF9kaWZmcxjpASABKAg6BHRydWUSJgoXZmluZF9iaWdfbGluZWFyX292ZXJsYXAY6gEgASgIOgR0cnVlEjAKIWZpbmRfY2xhdXNlc190aGF0X2FyZV9leGFjdGx5X29uZRjNAiABKAg6BHRydWUSIwoUdXNlX3NhdF9pbnByb2Nlc3NpbmcYowEgASgIOgR0cnVlEiYKGGlucHJvY2Vzc2luZ19kdGltZV9yYXRpbxiRAiABKAE6AzAuMhImChppbnByb2Nlc3NpbmdfcHJvYmluZ19kdGltZRiSAiABKAE6ATESKwofaW5wcm9jZXNzaW5nX21pbmltaXphdGlvbl9kdGltZRiTAiABKAE6ATESPgovaW5wcm9jZXNzaW5nX21pbmltaXphdGlvbl91c2VfY29uZmxpY3RfYW5hbHlzaXMYqQIgASgIOgR0cnVlEjsKK2lucHJvY2Vzc2luZ19taW5pbWl6YXRpb25fdXNlX2FsbF9vcmRlcmluZ3MYqgIgASgIOgVmYWxzZRIyCiNpbnByb2Nlc3NpbmdfdXNlX2NvbmdydWVuY2VfY2xvc3VyZRjWAiABKAg6BHRydWUSLQodaW5wcm9jZXNzaW5nX3VzZV9zYXRfc3dlZXBpbmcY4gIgASgIOgVmYWxzZRIXCgtudW1fd29ya2VycxjOASABKAU6ATASHQoSbnVtX3NlYXJjaF93b3JrZXJzGGQgASgFOgEwEh8KE251bV9mdWxsX3N1YnNvbHZlcnMYpgIgASgFOgEwEhMKCnN1YnNvbHZlcnMYzwEgAygJEhkKEGV4dHJhX3N1YnNvbHZlcnMY2wEgAygJEhoKEWlnbm9yZV9zdWJzb2x2ZXJzGNEBIAMoCRIaChFmaWx0ZXJfc3Vic29sdmVycxilAiADKAkSQQoQc3Vic29sdmVyX3BhcmFtcxjSASADKAsyJi5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzEiEKEWludGVybGVhdmVfc2VhcmNoGIgBIAEoCDoFZmFsc2USIQoVaW50ZXJsZWF2ZV9iYXRjaF9zaXplGIYBIAEoBToBMBIkChZzaGFyZV9vYmplY3RpdmVfYm91bmRzGHEgASgIOgR0cnVlEiUKF3NoYXJlX2xldmVsX3plcm9fYm91bmRzGHIgASgIOgR0cnVlEiQKFHNoYXJlX2xpbmVhcjJfYm91bmRzGMYCIAEoCDoFZmFsc2USIwoUc2hhcmVfYmluYXJ5X2NsYXVzZXMYywEgASgIOgR0cnVlEiEKEnNoYXJlX2dsdWVfY2xhdXNlcxidAiABKAg6BHRydWUSJgoXbWluaW1pemVfc2hhcmVkX2NsYXVzZXMYrAIgASgIOgR0cnVlEiQKGHNoYXJlX2dsdWVfY2xhdXNlc19kdGltZRjCAiABKAE6ATESIAoQY2hlY2tfbHJhdF9wcm9vZhjYAiABKAg6BWZhbHNlEicKF2NoZWNrX21lcmdlZF9scmF0X3Byb29mGOACIAEoCDoFZmFsc2USIQoRb3V0cHV0X2xyYXRfcHJvb2YY2QIgASgIOgVmYWxzZRIgChBjaGVja19kcmF0X3Byb29mGNoCIAEoCDoFZmFsc2USIQoRb3V0cHV0X2RyYXRfcHJvb2YY2wIgASgIOgVmYWxzZRImChhtYXhfZHJhdF90aW1lX2luX3NlY29uZHMY3AIgASgBOgNpbmYSMAogZGVidWdfcG9zdHNvbHZlX3dpdGhfZnVsbF9zb2x2ZXIYogEgASgIOgVmYWxzZRItCiFkZWJ1Z19tYXhfbnVtX3ByZXNvbHZlX29wZXJhdGlvbnMYlwEgASgFOgEwEicKF2RlYnVnX2NyYXNoX29uX2JhZF9oaW50GMMBIAEoCDoFZmFsc2USMwojZGVidWdfY3Jhc2hfaWZfcHJlc29sdmVfYnJlYWtzX2hpbnQYsgIgASgIOgVmYWxzZRIvCh9kZWJ1Z19jcmFzaF9pZl9scmF0X2NoZWNrX2ZhaWxzGNMCIAEoCDoFZmFsc2USJAoWdXNlX29wdGltaXphdGlvbl9oaW50cxgjIAEoCDoEdHJ1ZRIiChdjb3JlX21pbmltaXphdGlvbl9sZXZlbBgyIAEoBToBMhIhChNmaW5kX211bHRpcGxlX2NvcmVzGFQgASgIOgR0cnVlEiAKEmNvdmVyX29wdGltaXphdGlvbhhZIAEoCDoEdHJ1ZRJ4ChhtYXhfc2F0X2Fzc3VtcHRpb25fb3JkZXIYMyABKA4yPC5vcGVyYXRpb25zX3Jlc2VhcmNoLnNhdC5TYXRQYXJhbWV0ZXJzLk1heFNhdEFzc3VtcHRpb25PcmRlcjoYREVGQVVMVF9BU1NVTVBUSU9OX09SREVSEi8KIG1heF9zYXRfcmV2ZXJzZV9hc3N1bXB0aW9uX29yZGVyGDQgASgIOgVmYWxzZRJ8ChZtYXhfc2F0X3N0cmF0aWZpY2F0aW9uGDUgASgOMkQub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU2F0UGFyYW1ldGVycy5NYXhTYXRTdHJhdGlmaWNhdGlvbkFsZ29yaXRobToWU1RSQVRJRklDQVRJT05fREVTQ0VOVBIuCiFwcm9wYWdhdGlvbl9sb29wX2RldGVjdGlvbl9mYWN0b3IY3QEgASgBOgIxMBI3Cil1c2VfcHJlY2VkZW5jZXNfaW5fZGlzanVuY3RpdmVfY29uc3RyYWludBhKIAEoCDoEdHJ1ZRIzCiF0cmFuc2l0aXZlX3ByZWNlZGVuY2VzX3dvcmtfbGltaXQYxwIgASgFOgcxMDAwMDAwEkIKNW1heF9zaXplX3RvX2NyZWF0ZV9wcmVjZWRlbmNlX2xpdGVyYWxzX2luX2Rpc2p1bmN0aXZlGOUBIAEoBToCNjASNQoldXNlX3N0cm9uZ19wcm9wYWdhdGlvbl9pbl9kaXNqdW5jdGl2ZRjmASABKAg6BWZhbHNlEjUKJXVzZV9keW5hbWljX3ByZWNlZGVuY2VfaW5fZGlzanVuY3RpdmUYhwIgASgIOgVmYWxzZRI0CiR1c2VfZHluYW1pY19wcmVjZWRlbmNlX2luX2N1bXVsYXRpdmUYjAIgASgIOgVmYWxzZRIxCiJ1c2Vfb3ZlcmxvYWRfY2hlY2tlcl9pbl9jdW11bGF0aXZlGE4gASgIOgVmYWxzZRI3Cid1c2VfY29uc2VydmF0aXZlX3NjYWxlX292ZXJsb2FkX2NoZWNrZXIYngIgASgIOgVmYWxzZRI3Cih1c2VfdGltZXRhYmxlX2VkZ2VfZmluZGluZ19pbl9jdW11bGF0aXZlGE8gASgIOgVmYWxzZRI6CixtYXhfbnVtX2ludGVydmFsc19mb3JfdGltZXRhYmxlX2VkZ2VfZmluZGluZxiEAiABKAU6AzEwMBIyCiJ1c2VfaGFyZF9wcmVjZWRlbmNlc19pbl9jdW11bGF0aXZlGNcBIAEoCDoFZmFsc2USJwoXZXhwbG9pdF9hbGxfcHJlY2VkZW5jZXMY3AEgASgIOgVmYWxzZRI2Cih1c2VfZGlzanVuY3RpdmVfY29uc3RyYWludF9pbl9jdW11bGF0aXZlGFAgASgIOgR0cnVlEjIKJW5vX292ZXJsYXBfMmRfYm9vbGVhbl9yZWxhdGlvbnNfbGltaXQYwQIgASgFOgIxMBIwCiB1c2VfdGltZXRhYmxpbmdfaW5fbm9fb3ZlcmxhcF8yZBjIASABKAg6BWZhbHNlEjgKKHVzZV9lbmVyZ2V0aWNfcmVhc29uaW5nX2luX25vX292ZXJsYXBfMmQY1QEgASgIOgVmYWxzZRI9Ci11c2VfYXJlYV9lbmVyZ2V0aWNfcmVhc29uaW5nX2luX25vX292ZXJsYXBfMmQYjwIgASgIOgVmYWxzZRI3Cid1c2VfdHJ5X2VkZ2VfcmVhc29uaW5nX2luX25vX292ZXJsYXBfMmQYqwIgASgIOgVmYWxzZRI8Ci1tYXhfcGFpcnNfcGFpcndpc2VfcmVhc29uaW5nX2luX25vX292ZXJsYXBfMmQYlAIgASgFOgQxMjUwEkIKNm1heGltdW1fcmVnaW9uc190b19zcGxpdF9pbl9kaXNjb25uZWN0ZWRfbm9fb3ZlcmxhcF8yZBi7AiABKAU6ATASOAopdXNlX2xpbmVhcjNfZm9yX25vX292ZXJsYXBfMmRfcHJlY2VkZW5jZXMYwwIgASgIOgR0cnVlEi0KHnVzZV9kdWFsX3NjaGVkdWxpbmdfaGV1cmlzdGljcxjWASABKAg6BHRydWUSLQoddXNlX2FsbF9kaWZmZXJlbnRfZm9yX2NpcmN1aXQYtwIgASgIOgVmYWxzZRI9CjFyb3V0aW5nX2N1dF9zdWJzZXRfc2l6ZV9mb3JfYmluYXJ5X3JlbGF0aW9uX2JvdW5kGLgCIAEoBToBMBJDCjdyb3V0aW5nX2N1dF9zdWJzZXRfc2l6ZV9mb3JfdGlnaHRfYmluYXJ5X3JlbGF0aW9uX2JvdW5kGLkCIAEoBToBMBJDCjdyb3V0aW5nX2N1dF9zdWJzZXRfc2l6ZV9mb3JfZXhhY3RfYmluYXJ5X3JlbGF0aW9uX2JvdW5kGLwCIAEoBToBOBI8CjByb3V0aW5nX2N1dF9zdWJzZXRfc2l6ZV9mb3Jfc2hvcnRlc3RfcGF0aHNfYm91bmQYvgIgASgFOgE4EiUKFXJvdXRpbmdfY3V0X2RwX2VmZm9ydBi6AiABKAE6BTFlKzA3EjIKJnJvdXRpbmdfY3V0X21heF9pbmZlYXNpYmxlX3BhdGhfbGVuZ3RoGL0CIAEoBToBNhJiChBzZWFyY2hfYnJhbmNoaW5nGFIgASgOMjYub3BlcmF0aW9uc19yZXNlYXJjaC5zYXQuU2F0UGFyYW1ldGVycy5TZWFyY2hCcmFuY2hpbmc6EEFVVE9NQVRJQ19TRUFSQ0gSIAoTaGludF9jb25mbGljdF9saW1pdBiZASABKAU6AjEwEhsKC3JlcGFpcl9oaW50GKcBIAEoCDoFZmFsc2USMwojZml4X3ZhcmlhYmxlc190b190aGVpcl9oaW50ZWRfdmFsdWUYwAEgASgIOgVmYWxzZRIiChJ1c2VfcHJvYmluZ19zZWFyY2gYsAEgASgIOgVmYWxzZRIjChR1c2VfZXh0ZW5kZWRfcHJvYmluZxiNAiABKAg6BHRydWUSLgoecHJvYmluZ19udW1fY29tYmluYXRpb25zX2xpbWl0GJACIAEoBToFMjAwMDASPAosc2hhdmluZ19kZXRlcm1pbmlzdGljX3RpbWVfaW5fcHJvYmluZ19zZWFyY2gYzAEgASgBOgUwLjAwMRIvCiFzaGF2aW5nX3NlYXJjaF9kZXRlcm1pbmlzdGljX3RpbWUYzQEgASgBOgMwLjESJQoYc2hhdmluZ19zZWFyY2hfdGhyZXNob2xkGKICIAEoAzoCNjQSJwoXdXNlX29iamVjdGl2ZV9sYl9zZWFyY2gY5AEgASgIOgVmYWxzZRIsChx1c2Vfb2JqZWN0aXZlX3NoYXZpbmdfc2VhcmNoGP0BIAEoCDoFZmFsc2USJAoXdmFyaWFibGVzX3NoYXZpbmdfbGV2ZWwYoQIgASgFOgItMRIuCiFwc2V1ZG9fY29zdF9yZWxpYWJpbGl0eV90aHJlc2hvbGQYeyABKAM6AzEwMBIhChJvcHRpbWl6ZV93aXRoX2NvcmUYUyABKAg6BWZhbHNlEiwKHG9wdGltaXplX3dpdGhfbGJfdHJlZV9zZWFyY2gYvAEgASgIOgVmYWxzZRIvCh9zYXZlX2xwX2Jhc2lzX2luX2xiX3RyZWVfc2VhcmNoGJwCIAEoCDoFZmFsc2USJwobYmluYXJ5X3NlYXJjaF9udW1fY29uZmxpY3RzGGMgASgFOgItMRIjChRvcHRpbWl6ZV93aXRoX21heF9ocxhVIAEoCDoFZmFsc2USIwoUdXNlX2ZlYXNpYmlsaXR5X2p1bXAYiQIgASgIOgR0cnVlEhsKC3VzZV9sc19vbmx5GPABIAEoCDoFZmFsc2USJQoWZmVhc2liaWxpdHlfanVtcF9kZWNheRjyASABKAE6BDAuOTUSMAokZmVhc2liaWxpdHlfanVtcF9saW5lYXJpemF0aW9uX2xldmVsGIECIAEoBToBMhIrCh9mZWFzaWJpbGl0eV9qdW1wX3Jlc3RhcnRfZmFjdG9yGIICIAEoBToBMRIqChxmZWFzaWJpbGl0eV9qdW1wX2JhdGNoX2R0aW1lGKQCIAEoAToDMC4xEj0KLmZlYXNpYmlsaXR5X2p1bXBfdmFyX3JhbmRvbWl6YXRpb25fcHJvYmFiaWxpdHkY9wEgASgBOgQwLjA1EjsKLWZlYXNpYmlsaXR5X2p1bXBfdmFyX3BlcmJ1cmJhdGlvbl9yYW5nZV9yYXRpbxj4ASABKAE6AzAuMhIvCiBmZWFzaWJpbGl0eV9qdW1wX2VuYWJsZV9yZXN0YXJ0cxj6ASABKAg6BHRydWUSOwotZmVhc2liaWxpdHlfanVtcF9tYXhfZXhwYW5kZWRfY29uc3RyYWludF9zaXplGIgCIAEoBToDNTAwEhwKEG51bV92aW9sYXRpb25fbHMY9AEgASgFOgEwEi4KIHZpb2xhdGlvbl9sc19wZXJ0dXJiYXRpb25fcGVyaW9kGPkBIAEoBToDMTAwEjQKJnZpb2xhdGlvbl9sc19jb21wb3VuZF9tb3ZlX3Byb2JhYmlsaXR5GIMCIAEoAToDMC41EiQKF3NoYXJlZF90cmVlX251bV93b3JrZXJzGOsBIAEoBToCLTESJgoWdXNlX3NoYXJlZF90cmVlX3NlYXJjaBjsASABKAg6BWZhbHNlEjcKK3NoYXJlZF90cmVlX3dvcmtlcl9taW5fcmVzdGFydHNfcGVyX3N1YnRyZWUYmgIgASgFOgExEjYKJ3NoYXJlZF90cmVlX3dvcmtlcl9lbmFibGVfdHJhaWxfc2hhcmluZxinAiABKAg6BHRydWUSNgonc2hhcmVkX3RyZWVfd29ya2VyX2VuYWJsZV9waGFzZV9zaGFyaW5nGLACIAEoCDoEdHJ1ZRIuCiJzaGFyZWRfdHJlZV9vcGVuX2xlYXZlc19wZXJfd29ya2VyGJkCIAEoAToBMhIwCiBzaGFyZWRfdHJlZV9tYXhfbm9kZXNfcGVyX3dvcmtlchjuASABKAU6BTEwMDAwEngKGnNoYXJlZF90cmVlX3NwbGl0X3N0cmF0ZWd5GO8BIAEoDjI+Lm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlNhdFBhcmFtZXRlcnMuU2hhcmVkVHJlZVNwbGl0U3RyYXRlZ3k6E1NQTElUX1NUUkFURUdZX0FVVE8SKQodc2hhcmVkX3RyZWVfYmFsYW5jZV90b2xlcmFuY2UYsQIgASgFOgExEikKG3NoYXJlZF90cmVlX3NwbGl0X21pbl9kdGltZRjIAiABKAE6AzAuMRImChdlbnVtZXJhdGVfYWxsX3NvbHV0aW9ucxhXIAEoCDoFZmFsc2USNwona2VlcF9hbGxfZmVhc2libGVfc29sdXRpb25zX2luX3ByZXNvbHZlGK0BIAEoCDoFZmFsc2USMgoiZmlsbF90aWdodGVuZWRfZG9tYWluc19pbl9yZXNwb25zZRiEASABKAg6BWZhbHNlEjUKJWZpbGxfYWRkaXRpb25hbF9zb2x1dGlvbnNfaW5fcmVzcG9uc2UYwgEgASgIOgVmYWxzZRInChlpbnN0YW50aWF0ZV9hbGxfdmFyaWFibGVzGGogASgIOgR0cnVlEjYKKGF1dG9fZGV0ZWN0X2dyZWF0ZXJfdGhhbl9hdF9sZWFzdF9vbmVfb2YYXyABKAg6BHRydWUSKAoZc3RvcF9hZnRlcl9maXJzdF9zb2x1dGlvbhhiIAEoCDoFZmFsc2USIwoTc3RvcF9hZnRlcl9wcmVzb2x2ZRiVASABKAg6BWZhbHNlEisKG3N0b3BfYWZ0ZXJfcm9vdF9wcm9wYWdhdGlvbhj8ASABKAg6BWZhbHNlEiQKFmxuc19pbml0aWFsX2RpZmZpY3VsdHkYswIgASgBOgMwLjUSLQofbG5zX2luaXRpYWxfZGV0ZXJtaW5pc3RpY19saW1pdBi0AiABKAE6AzAuMRIWCgd1c2VfbG5zGJsCIAEoCDoEdHJ1ZRIbCgx1c2VfbG5zX29ubHkYZSABKAg6BWZhbHNlEh4KEnNvbHV0aW9uX3Bvb2xfc2l6ZRjBASABKAU6ATMSKgodc29sdXRpb25fcG9vbF9kaXZlcnNpdHlfbGltaXQYyQIgASgFOgIxMBIhChVhbHRlcm5hdGl2ZV9wb29sX3NpemUYxQIgASgFOgExEhsKDHVzZV9yaW5zX2xucxiBASABKAg6BHRydWUSIwoUdXNlX2ZlYXNpYmlsaXR5X3B1bXAYpAEgASgIOgR0cnVlEh8KEHVzZV9sYl9yZWxheF9sbnMY/wEgASgIOgR0cnVlEisKHmxiX3JlbGF4X251bV93b3JrZXJzX3RocmVzaG9sZBioAiABKAU6AjE2EmMKC2ZwX3JvdW5kaW5nGKUBIAEoDjI3Lm9wZXJhdGlvbnNfcmVzZWFyY2guc2F0LlNhdFBhcmFtZXRlcnMuRlBSb3VuZGluZ01ldGhvZDoUUFJPUEFHQVRJT05fQVNTSVNURUQSJAoUZGl2ZXJzaWZ5X2xuc19wYXJhbXMYiQEgASgIOgVmYWxzZRIfChByYW5kb21pemVfc2VhcmNoGGcgASgIOgVmYWxzZRIrCiBzZWFyY2hfcmFuZG9tX3ZhcmlhYmxlX3Bvb2xfc2l6ZRhoIAEoAzoBMBIrChtwdXNoX2FsbF90YXNrc190b3dhcmRfc3RhcnQYhgIgASgIOgVmYWxzZRIlChZ1c2Vfb3B0aW9uYWxfdmFyaWFibGVzGGwgASgIOgVmYWxzZRIhChN1c2VfZXhhY3RfbHBfcmVhc29uGG0gASgIOgR0cnVlEicKF3VzZV9jb21iaW5lZF9ub19vdmVybGFwGIUBIAEoCDoFZmFsc2USKgoeYXRfbW9zdF9vbmVfbWF4X2V4cGFuc2lvbl9zaXplGI4CIAEoBToBMxIiChNjYXRjaF9zaWdpbnRfc2lnbmFsGIcBIAEoCDoEdHJ1ZRIhChJ1c2VfaW1wbGllZF9ib3VuZHMYkAEgASgIOgR0cnVlEiIKEnBvbGlzaF9scF9zb2x1dGlvbhivASABKAg6BWZhbHNlEiMKE2xwX3ByaW1hbF90b2xlcmFuY2UYigIgASgBOgUxZS0wNxIhChFscF9kdWFsX3RvbGVyYW5jZRiLAiABKAE6BTFlLTA3EiAKEWNvbnZlcnRfaW50ZXJ2YWxzGLEBIAEoCDoEdHJ1ZRIaCg5zeW1tZXRyeV9sZXZlbBi3ASABKAU6ATISIgoSdXNlX3N5bW1ldHJ5X2luX2xwGK0CIAEoCDoFZmFsc2USKQoZa2VlcF9zeW1tZXRyeV9pbl9wcmVzb2x2ZRivAiABKAg6BWZhbHNlEjcKK3N5bW1ldHJ5X2RldGVjdGlvbl9kZXRlcm1pbmlzdGljX3RpbWVfbGltaXQYrgIgASgBOgExEiUKFm5ld19saW5lYXJfcHJvcGFnYXRpb24Y4AEgASgIOgR0cnVlEh8KEWxpbmVhcl9zcGxpdF9zaXplGIACIAEoBToDMTAwEh4KE2xpbmVhcml6YXRpb25fbGV2ZWwYWiABKAU6ATESIQoWYm9vbGVhbl9lbmNvZGluZ19sZXZlbBhrIAEoBToBMRI9CjBtYXhfZG9tYWluX3NpemVfd2hlbl9lbmNvZGluZ19lcV9uZXFfY29uc3RyYWludHMYvwEgASgFOgIxNhIbCgxtYXhfbnVtX2N1dHMYWyABKAU6BTEwMDAwEhUKCWN1dF9sZXZlbBjEASABKAU6ATESKgobb25seV9hZGRfY3V0c19hdF9sZXZlbF96ZXJvGFwgASgIOgVmYWxzZRIhChFhZGRfb2JqZWN0aXZlX2N1dBjFASABKAg6BWZhbHNlEhkKC2FkZF9jZ19jdXRzGHUgASgIOgR0cnVlEhoKDGFkZF9taXJfY3V0cxh4IAEoCDoEdHJ1ZRIhChJhZGRfemVyb19oYWxmX2N1dHMYqQEgASgIOgR0cnVlEh4KD2FkZF9jbGlxdWVfY3V0cxisASABKAg6BHRydWUSGwoMYWRkX3JsdF9jdXRzGJcCIAEoCDoEdHJ1ZRIiChVtYXhfYWxsX2RpZmZfY3V0X3NpemUYlAEgASgFOgI2NBIfChBhZGRfbGluX21heF9jdXRzGJgBIAEoCDoEdHJ1ZRIpChxtYXhfaW50ZWdlcl9yb3VuZGluZ19zY2FsaW5nGHcgASgFOgM2MDASJwoZYWRkX2xwX2NvbnN0cmFpbnRzX2xhemlseRhwIAEoCDoEdHJ1ZRIhChJyb290X2xwX2l0ZXJhdGlvbnMY4wEgASgFOgQyMDAwEjIKJG1pbl9vcnRob2dvbmFsaXR5X2Zvcl9scF9jb25zdHJhaW50cxhzIAEoAToEMC4wNRIoChxtYXhfY3V0X3JvdW5kc19hdF9sZXZlbF96ZXJvGJoBIAEoBToBMRIrCh5tYXhfY29uc2VjdXRpdmVfaW5hY3RpdmVfY291bnQYeSABKAU6AzEwMBIqChpjdXRfbWF4X2FjdGl2ZV9jb3VudF92YWx1ZRibASABKAE6BTFlKzEwEiQKFmN1dF9hY3RpdmVfY291bnRfZGVjYXkYnAEgASgBOgMwLjgSIQoSY3V0X2NsZWFudXBfdGFyZ2V0GJ0BIAEoBToEMTAwMBImChpuZXdfY29uc3RyYWludHNfYmF0Y2hfc2l6ZRh6IAEoBToCNTASKQobZXhwbG9pdF9pbnRlZ2VyX2xwX3NvbHV0aW9uGF4gASgIOgR0cnVlEiUKF2V4cGxvaXRfYWxsX2xwX3NvbHV0aW9uGHQgASgIOgR0cnVlEiUKFWV4cGxvaXRfYmVzdF9zb2x1dGlvbhiCASABKAg6BWZhbHNlEisKG2V4cGxvaXRfcmVsYXhhdGlvbl9zb2x1dGlvbhihASABKAg6BWZhbHNlEiAKEWV4cGxvaXRfb2JqZWN0aXZlGIMBIAEoCDoEdHJ1ZRIpChlkZXRlY3RfbGluZWFyaXplZF9wcm9kdWN0GJUCIAEoCDoFZmFsc2USMwojdXNlX25ld19pbnRlZ2VyX2NvbmZsaWN0X3Jlc29sdXRpb24Y0AIgASgIOgVmYWxzZRItCh5jcmVhdGVfMXVpcF9ib29sZWFuX2R1cmluZ19pY3IY1QIgASgIOgR0cnVlEhwKDW1pcF9tYXhfYm91bmQYfCABKAE6BTFlKzA3EhoKD21pcF92YXJfc2NhbGluZxh9IAEoAToBMRImChZtaXBfc2NhbGVfbGFyZ2VfZG9tYWluGOEBIAEoCDoFZmFsc2USMAohbWlwX2F1dG9tYXRpY2FsbHlfc2NhbGVfdmFyaWFibGVzGKYBIAEoCDoEdHJ1ZRIdCg1vbmx5X3NvbHZlX2lwGN4BIAEoCDoFZmFsc2USIwoUbWlwX3dhbnRlZF9wcmVjaXNpb24YfiABKAE6BTFlLTA2EiUKGW1pcF9tYXhfYWN0aXZpdHlfZXhwb25lbnQYfyABKAU6AjUzEiQKE21pcF9jaGVja19wcmVjaXNpb24YgAEgASgBOgYwLjAwMDESLwogbWlwX2NvbXB1dGVfdHJ1ZV9vYmplY3RpdmVfYm91bmQYxgEgASgIOgR0cnVlEicKF21pcF9tYXhfdmFsaWRfbWFnbml0dWRlGMcBIAEoAToFMWUrMjASOworbWlwX3RyZWF0X2hpZ2hfbWFnbml0dWRlX2JvdW5kc19hc19pbmZpbml0eRiWAiABKAg6BWZhbHNlEiIKEm1pcF9kcm9wX3RvbGVyYW5jZRjoASABKAE6BTFlLTE2Eh4KEm1pcF9wcmVzb2x2ZV9sZXZlbBiFAiABKAU6ATIiSAoNVmFyaWFibGVPcmRlchIMCghJTl9PUkRFUhAAEhQKEElOX1JFVkVSU0VfT1JERVIQARITCg9JTl9SQU5ET01fT1JERVIQAiJGCghQb2xhcml0eRIRCg1QT0xBUklUWV9UUlVFEAASEgoOUE9MQVJJVFlfRkFMU0UQARITCg9QT0xBUklUWV9SQU5ET00QAiJKCh1Db25mbGljdE1pbmltaXphdGlvbkFsZ29yaXRobRIICgROT05FEAASCgoGU0lNUExFEAESDQoJUkVDVVJTSVZFEAIiBAgDEAMimwEKGUJpbmFyeU1pbml6YXRpb25BbGdvcml0aG0SGgoWTk9fQklOQVJZX01JTklNSVpBVElPThAAEiAKHEJJTkFSWV9NSU5JTUlaQVRJT05fRlJPTV9VSVAQARIuCipCSU5BUllfTUlOSU1JWkFUSU9OX0ZST01fVUlQX0FORF9ERUNJU0lPTlMQBSIECAIQAiIECAMQAyIECAQQBCI1Cg5DbGF1c2VPcmRlcmluZxITCg9DTEFVU0VfQUNUSVZJVFkQABIOCgpDTEFVU0VfTEJEEAEihgEKEFJlc3RhcnRBbGdvcml0aG0SDgoKTk9fUkVTVEFSVBAAEhAKDExVQllfUkVTVEFSVBABEh0KGURMX01PVklOR19BVkVSQUdFX1JFU1RBUlQQAhIeChpMQkRfTU9WSU5HX0FWRVJBR0VfUkVTVEFSVBADEhEKDUZJWEVEX1JFU1RBUlQQBCJ0ChVNYXhTYXRBc3N1bXB0aW9uT3JkZXISHAoYREVGQVVMVF9BU1NVTVBUSU9OX09SREVSEAASHQoZT1JERVJfQVNTVU1QVElPTl9CWV9ERVBUSBABEh4KGk9SREVSX0FTU1VNUFRJT05fQllfV0VJR0hUEAIibwodTWF4U2F0U3RyYXRpZmljYXRpb25BbGdvcml0aG0SFwoTU1RSQVRJRklDQVRJT05fTk9ORRAAEhoKFlNUUkFUSUZJQ0FUSU9OX0RFU0NFTlQQARIZChVTVFJBVElGSUNBVElPTl9BU0NFTlQQAiLhAQoPU2VhcmNoQnJhbmNoaW5nEhQKEEFVVE9NQVRJQ19TRUFSQ0gQABIQCgxGSVhFRF9TRUFSQ0gQARIUChBQT1JURk9MSU9fU0VBUkNIEAISDQoJTFBfU0VBUkNIEAMSFgoSUFNFVURPX0NPU1RfU0VBUkNIEAQSJwojUE9SVEZPTElPX1dJVEhfUVVJQ0tfUkVTVEFSVF9TRUFSQ0gQBRIPCgtISU5UX1NFQVJDSBAGEhgKFFBBUlRJQUxfRklYRURfU0VBUkNIEAcSFQoRUkFORE9NSVpFRF9TRUFSQ0gQCCK4AQoXU2hhcmVkVHJlZVNwbGl0U3RyYXRlZ3kSFwoTU1BMSVRfU1RSQVRFR1lfQVVUTxAAEh4KGlNQTElUX1NUUkFURUdZX0RJU0NSRVBBTkNZEAESHwobU1BMSVRfU1RSQVRFR1lfT0JKRUNUSVZFX0xCEAISIAocU1BMSVRfU1RSQVRFR1lfQkFMQU5DRURfVFJFRRADEiEKHVNQTElUX1NUUkFURUdZX0ZJUlNUX1BST1BPU0FMEAQiaAoQRlBSb3VuZGluZ01ldGhvZBITCg9ORUFSRVNUX0lOVEVHRVIQABIOCgpMT0NLX0JBU0VEEAESFQoRQUNUSVZFX0xPQ0tfQkFTRUQQAxIYChRQUk9QQUdBVElPTl9BU1NJU1RFRBACQmsKFmNvbS5nb29nbGUub3J0b29scy5zYXRQAVo6Z2l0aHViLmNvbS9nb29nbGUvb3ItdG9vbHMvb3J0b29scy9zYXQvcHJvdG8vc2F0cGFyYW1ldGVyc6oCEkdvb2dsZS5PclRvb2xzLlNhdA");
var SatParametersSchema = /* @__PURE__ */ messageDesc(file_sat_parameters, 0);
var SatParameters_VariableOrder;
(function(SatParameters_VariableOrder2) {
  SatParameters_VariableOrder2[SatParameters_VariableOrder2["IN_ORDER"] = 0] = "IN_ORDER";
  SatParameters_VariableOrder2[SatParameters_VariableOrder2["IN_REVERSE_ORDER"] = 1] = "IN_REVERSE_ORDER";
  SatParameters_VariableOrder2[SatParameters_VariableOrder2["IN_RANDOM_ORDER"] = 2] = "IN_RANDOM_ORDER";
})(SatParameters_VariableOrder || (SatParameters_VariableOrder = {}));
var SatParameters_Polarity;
(function(SatParameters_Polarity2) {
  SatParameters_Polarity2[SatParameters_Polarity2["TRUE"] = 0] = "TRUE";
  SatParameters_Polarity2[SatParameters_Polarity2["FALSE"] = 1] = "FALSE";
  SatParameters_Polarity2[SatParameters_Polarity2["RANDOM"] = 2] = "RANDOM";
})(SatParameters_Polarity || (SatParameters_Polarity = {}));
var SatParameters_ConflictMinimizationAlgorithm;
(function(SatParameters_ConflictMinimizationAlgorithm2) {
  SatParameters_ConflictMinimizationAlgorithm2[SatParameters_ConflictMinimizationAlgorithm2["NONE"] = 0] = "NONE";
  SatParameters_ConflictMinimizationAlgorithm2[SatParameters_ConflictMinimizationAlgorithm2["SIMPLE"] = 1] = "SIMPLE";
  SatParameters_ConflictMinimizationAlgorithm2[SatParameters_ConflictMinimizationAlgorithm2["RECURSIVE"] = 2] = "RECURSIVE";
})(SatParameters_ConflictMinimizationAlgorithm || (SatParameters_ConflictMinimizationAlgorithm = {}));
var SatParameters_BinaryMinizationAlgorithm;
(function(SatParameters_BinaryMinizationAlgorithm2) {
  SatParameters_BinaryMinizationAlgorithm2[SatParameters_BinaryMinizationAlgorithm2["NO_BINARY_MINIMIZATION"] = 0] = "NO_BINARY_MINIMIZATION";
  SatParameters_BinaryMinizationAlgorithm2[SatParameters_BinaryMinizationAlgorithm2["BINARY_MINIMIZATION_FROM_UIP"] = 1] = "BINARY_MINIMIZATION_FROM_UIP";
  SatParameters_BinaryMinizationAlgorithm2[SatParameters_BinaryMinizationAlgorithm2["BINARY_MINIMIZATION_FROM_UIP_AND_DECISIONS"] = 5] = "BINARY_MINIMIZATION_FROM_UIP_AND_DECISIONS";
})(SatParameters_BinaryMinizationAlgorithm || (SatParameters_BinaryMinizationAlgorithm = {}));
var SatParameters_ClauseOrdering;
(function(SatParameters_ClauseOrdering2) {
  SatParameters_ClauseOrdering2[SatParameters_ClauseOrdering2["CLAUSE_ACTIVITY"] = 0] = "CLAUSE_ACTIVITY";
  SatParameters_ClauseOrdering2[SatParameters_ClauseOrdering2["CLAUSE_LBD"] = 1] = "CLAUSE_LBD";
})(SatParameters_ClauseOrdering || (SatParameters_ClauseOrdering = {}));
var SatParameters_RestartAlgorithm;
(function(SatParameters_RestartAlgorithm2) {
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["NO_RESTART"] = 0] = "NO_RESTART";
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["LUBY_RESTART"] = 1] = "LUBY_RESTART";
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["DL_MOVING_AVERAGE_RESTART"] = 2] = "DL_MOVING_AVERAGE_RESTART";
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["LBD_MOVING_AVERAGE_RESTART"] = 3] = "LBD_MOVING_AVERAGE_RESTART";
  SatParameters_RestartAlgorithm2[SatParameters_RestartAlgorithm2["FIXED_RESTART"] = 4] = "FIXED_RESTART";
})(SatParameters_RestartAlgorithm || (SatParameters_RestartAlgorithm = {}));
var SatParameters_MaxSatAssumptionOrder;
(function(SatParameters_MaxSatAssumptionOrder2) {
  SatParameters_MaxSatAssumptionOrder2[SatParameters_MaxSatAssumptionOrder2["DEFAULT_ASSUMPTION_ORDER"] = 0] = "DEFAULT_ASSUMPTION_ORDER";
  SatParameters_MaxSatAssumptionOrder2[SatParameters_MaxSatAssumptionOrder2["ORDER_ASSUMPTION_BY_DEPTH"] = 1] = "ORDER_ASSUMPTION_BY_DEPTH";
  SatParameters_MaxSatAssumptionOrder2[SatParameters_MaxSatAssumptionOrder2["ORDER_ASSUMPTION_BY_WEIGHT"] = 2] = "ORDER_ASSUMPTION_BY_WEIGHT";
})(SatParameters_MaxSatAssumptionOrder || (SatParameters_MaxSatAssumptionOrder = {}));
var SatParameters_MaxSatStratificationAlgorithm;
(function(SatParameters_MaxSatStratificationAlgorithm2) {
  SatParameters_MaxSatStratificationAlgorithm2[SatParameters_MaxSatStratificationAlgorithm2["STRATIFICATION_NONE"] = 0] = "STRATIFICATION_NONE";
  SatParameters_MaxSatStratificationAlgorithm2[SatParameters_MaxSatStratificationAlgorithm2["STRATIFICATION_DESCENT"] = 1] = "STRATIFICATION_DESCENT";
  SatParameters_MaxSatStratificationAlgorithm2[SatParameters_MaxSatStratificationAlgorithm2["STRATIFICATION_ASCENT"] = 2] = "STRATIFICATION_ASCENT";
})(SatParameters_MaxSatStratificationAlgorithm || (SatParameters_MaxSatStratificationAlgorithm = {}));
var SatParameters_SearchBranching;
(function(SatParameters_SearchBranching2) {
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["AUTOMATIC_SEARCH"] = 0] = "AUTOMATIC_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["FIXED_SEARCH"] = 1] = "FIXED_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["PORTFOLIO_SEARCH"] = 2] = "PORTFOLIO_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["LP_SEARCH"] = 3] = "LP_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["PSEUDO_COST_SEARCH"] = 4] = "PSEUDO_COST_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["PORTFOLIO_WITH_QUICK_RESTART_SEARCH"] = 5] = "PORTFOLIO_WITH_QUICK_RESTART_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["HINT_SEARCH"] = 6] = "HINT_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["PARTIAL_FIXED_SEARCH"] = 7] = "PARTIAL_FIXED_SEARCH";
  SatParameters_SearchBranching2[SatParameters_SearchBranching2["RANDOMIZED_SEARCH"] = 8] = "RANDOMIZED_SEARCH";
})(SatParameters_SearchBranching || (SatParameters_SearchBranching = {}));
var SatParameters_SharedTreeSplitStrategy;
(function(SatParameters_SharedTreeSplitStrategy2) {
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_AUTO"] = 0] = "SPLIT_STRATEGY_AUTO";
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_DISCREPANCY"] = 1] = "SPLIT_STRATEGY_DISCREPANCY";
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_OBJECTIVE_LB"] = 2] = "SPLIT_STRATEGY_OBJECTIVE_LB";
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_BALANCED_TREE"] = 3] = "SPLIT_STRATEGY_BALANCED_TREE";
  SatParameters_SharedTreeSplitStrategy2[SatParameters_SharedTreeSplitStrategy2["SPLIT_STRATEGY_FIRST_PROPOSAL"] = 4] = "SPLIT_STRATEGY_FIRST_PROPOSAL";
})(SatParameters_SharedTreeSplitStrategy || (SatParameters_SharedTreeSplitStrategy = {}));
var SatParameters_FPRoundingMethod;
(function(SatParameters_FPRoundingMethod2) {
  SatParameters_FPRoundingMethod2[SatParameters_FPRoundingMethod2["NEAREST_INTEGER"] = 0] = "NEAREST_INTEGER";
  SatParameters_FPRoundingMethod2[SatParameters_FPRoundingMethod2["LOCK_BASED"] = 1] = "LOCK_BASED";
  SatParameters_FPRoundingMethod2[SatParameters_FPRoundingMethod2["ACTIVE_LOCK_BASED"] = 3] = "ACTIVE_LOCK_BASED";
  SatParameters_FPRoundingMethod2[SatParameters_FPRoundingMethod2["PROPAGATION_ASSISTED"] = 2] = "PROPAGATION_ASSISTED";
})(SatParameters_FPRoundingMethod || (SatParameters_FPRoundingMethod = {}));

// vendor/cpsat-js/dist/solver/cp-solver.js
var glueLoader;
var glueIsThreaded = false;
function setGlueLoader(loader, threaded) {
  glueLoader = loader;
  glueIsThreaded = threaded;
}
function readResponse(response) {
  return {
    status: response.status,
    objectiveValue: response.objectiveValue,
    bestObjectiveBound: response.bestObjectiveBound,
    wallTime: response.wallTime,
    value(variable) {
      return Number(response.solution[variable.index]);
    },
    response
  };
}
var CpSolver = class _CpSolver {
  module;
  constructor(module) {
    this.module = module;
  }
  static async create(options) {
    if (!glueLoader) {
      throw new Error("No WASM build was registered. Import the package entry point ('cpsat-js', 'cpsat-js/threaded' or 'cpsat-js/portable') rather than a deep internal path.");
    }
    const createModule = await glueLoader(options?.locateFile);
    const module = await createModule();
    return new _CpSolver(module);
  }
  solve(model, params) {
    const modelProto = model.toProto();
    const modelBytes = toBinary(CpModelProtoSchema, modelProto);
    const satParams = create(SatParametersSchema, {});
    satParams.numWorkers = 8;
    if (params?.maxTimeInSeconds !== void 0) {
      satParams.maxTimeInSeconds = params.maxTimeInSeconds;
    }
    if (params?.numWorkers !== void 0) {
      satParams.numWorkers = params.numWorkers;
    }
    if (params?.enumerateAllSolutions !== void 0) {
      satParams.enumerateAllSolutions = params.enumerateAllSolutions;
    }
    if (!glueIsThreaded) {
      satParams.numWorkers = 1;
    }
    const paramsBytes = toBinary(SatParametersSchema, satParams);
    const modelPtr = this.module._malloc(modelBytes.length);
    this.module.HEAPU8.set(modelBytes, modelPtr);
    const paramsPtr = this.module._malloc(paramsBytes.length);
    this.module.HEAPU8.set(paramsBytes, paramsPtr);
    const onSolution = params?.onSolution;
    if (onSolution) {
      this.module.__cpsatOnSolution = (bytes) => {
        onSolution({ ...readResponse(fromBinary(CpSolverResponseSchema, bytes)), live: true });
      };
    }
    let resultLen;
    try {
      resultLen = this.module._solve(modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, onSolution ? 1 : 0);
    } finally {
      this.module._free(modelPtr);
      this.module._free(paramsPtr);
      delete this.module.__cpsatOnSolution;
    }
    if (onSolution) {
      const recorded = this.module._solution_count();
      for (let i = 0; i < recorded; i++) {
        const ptr = this.module._solution_ptr(i);
        const len = this.module._solution_len(i);
        const bytes = this.module.HEAPU8.slice(ptr, ptr + len);
        onSolution({ ...readResponse(fromBinary(CpSolverResponseSchema, bytes)), live: false });
      }
    }
    const resultPtr = this.module._get_result_ptr();
    const resultBytes = new Uint8Array(this.module.HEAPU8.buffer, resultPtr, resultLen);
    const resultCopy = new Uint8Array(resultBytes);
    this.module._free_result();
    const response = fromBinary(CpSolverResponseSchema, resultCopy);
    return {
      status: response.status,
      objectiveValue: response.objectiveValue,
      bestObjectiveBound: response.bestObjectiveBound,
      wallTime: response.wallTime,
      value(variable) {
        return Number(response.solution[variable.index]);
      },
      response
    };
  }
};
function makeGlueLoader(importGlue, wasmUrl) {
  return async (locateFile) => {
    const glue = await importGlue();
    const factory = glue.default;
    if (typeof factory !== "function") {
      throw new Error("cpsat glue did not export a factory function");
    }
    const url = wasmUrl();
    const resolvedLocate = locateFile ?? ((path) => path.endsWith(".wasm") ? url : path);
    return (options) => factory({ ...options, locateFile: resolvedLocate });
  };
}

// vendor/cpsat-js/dist/model/linear-expr.js
var LinearExpr = class _LinearExpr {
  /** Map from variable index to coefficient */
  terms;
  offset;
  constructor(terms, offset) {
    this.terms = terms;
    this.offset = offset;
  }
  static fromConstant(value) {
    return new _LinearExpr(/* @__PURE__ */ new Map(), BigInt(value));
  }
  static fromVarIndex(varIndex, coeff = 1n) {
    return new _LinearExpr(/* @__PURE__ */ new Map([[varIndex, coeff]]), 0n);
  }
  plus(other) {
    if (typeof other === "number" || typeof other === "bigint") {
      return new _LinearExpr(new Map(this.terms), this.offset + BigInt(other));
    }
    const newTerms = new Map(this.terms);
    for (const [varIdx, coeff] of other.terms) {
      const existing = newTerms.get(varIdx) ?? 0n;
      const sum = existing + coeff;
      if (sum === 0n) {
        newTerms.delete(varIdx);
      } else {
        newTerms.set(varIdx, sum);
      }
    }
    return new _LinearExpr(newTerms, this.offset + other.offset);
  }
  minus(other) {
    if (typeof other === "number" || typeof other === "bigint") {
      return new _LinearExpr(new Map(this.terms), this.offset - BigInt(other));
    }
    return this.plus(other.times(-1));
  }
  times(scalar) {
    const s = BigInt(scalar);
    if (s === 0n) {
      return _LinearExpr.fromConstant(0);
    }
    const newTerms = /* @__PURE__ */ new Map();
    for (const [varIdx, coeff] of this.terms) {
      newTerms.set(varIdx, coeff * s);
    }
    return new _LinearExpr(newTerms, this.offset * s);
  }
  negate() {
    return this.times(-1);
  }
  /** expr == value */
  equals(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, 0n, 0n);
  }
  /** expr <= value */
  le(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, -4503599627370496n, 0n);
  }
  /** expr >= value */
  ge(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, 0n, 4503599627370496n);
  }
  /** expr < value */
  lt(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, -4503599627370496n, -1n);
  }
  /** expr > value */
  gt(other) {
    const rhs = typeof other === "number" || typeof other === "bigint" ? _LinearExpr.fromConstant(other) : other;
    const diff = this.minus(rhs);
    return new BoundedLinearExpression(diff, 1n, 4503599627370496n);
  }
  toProto() {
    const vars = [];
    const coeffs = [];
    for (const [varIdx, coeff] of this.terms) {
      vars.push(varIdx);
      coeffs.push(coeff);
    }
    return create(LinearExpressionProtoSchema, {
      vars,
      coeffs,
      offset: this.offset
    });
  }
};
var BoundedLinearExpression = class {
  expr;
  lb;
  ub;
  constructor(expr, lb, ub) {
    this.expr = expr;
    this.lb = lb;
    this.ub = ub;
  }
};
function toLinearExpr(value) {
  if (value instanceof LinearExpr)
    return value;
  if (typeof value === "number" || typeof value === "bigint")
    return LinearExpr.fromConstant(value);
  return value.toLinearExpr();
}

// vendor/cpsat-js/dist/model/int-var.js
var INT_VAR_MIN = -(2 ** 52);
var INT_VAR_MAX = 2 ** 52;
var IntVar = class {
  index;
  name;
  constructor(index, name) {
    this.index = index;
    this.name = name;
  }
  toLinearExpr() {
    return LinearExpr.fromVarIndex(this.index);
  }
  plus(other) {
    return this.toLinearExpr().plus(toLinearExpr(other));
  }
  minus(other) {
    return this.toLinearExpr().minus(toLinearExpr(other));
  }
  times(scalar) {
    return this.toLinearExpr().times(scalar);
  }
  negate() {
    return this.toLinearExpr().negate();
  }
  /** expr == other */
  equals(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, 0n, 0n);
  }
  /** expr != other — encoded as domain with hole at 0 */
  notEquals(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, BigInt(INT_VAR_MIN), BigInt(INT_VAR_MAX));
  }
  /** expr <= other */
  le(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, BigInt(INT_VAR_MIN), 0n);
  }
  /** expr >= other */
  ge(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, 0n, BigInt(INT_VAR_MAX));
  }
  /** expr < other */
  lt(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, BigInt(INT_VAR_MIN), -1n);
  }
  /** expr > other */
  gt(other) {
    const lhs = this.toLinearExpr();
    const rhs = toLinearExpr(other);
    const diff = lhs.minus(rhs);
    return new BoundedLinearExpression(diff, 1n, BigInt(INT_VAR_MAX));
  }
  /** Negative literal: NOT this variable (for boolean context) */
  not() {
    return -this.index - 1;
  }
};
var BoolVar = class extends IntVar {
  constructor(index, name) {
    super(index, name);
  }
};

// vendor/cpsat-js/dist/model/interval-var.js
var IntervalVar = class {
  /** Index of the interval constraint in the model's constraints array */
  constraintIndex;
  name;
  constructor(constraintIndex, name) {
    this.constraintIndex = constraintIndex;
    this.name = name;
  }
};

// vendor/cpsat-js/dist/model/constraint.js
var Constraint = class {
  proto;
  constructor(proto) {
    this.proto = proto;
  }
  /**
   * Sets enforcement literals. The constraint is only enforced when
   * all given literals are true.
   */
  onlyEnforceIf(literals) {
    const arr = Array.isArray(literals) ? literals : [literals];
    this.proto.enforcementLiteral = arr.map((lit) => typeof lit === "number" ? lit : lit.index);
    return this;
  }
};

// vendor/cpsat-js/dist/model/cp-model.js
var CpModel = class {
  proto;
  /**
   * Hinted values, keyed by variable index.
   *
   * A Map rather than the proto's two parallel arrays because CpModelProto requires
   * the hinted indices to be unique. Keyed this way, hinting one variable twice
   * cannot be expressed, so it cannot produce an invalid model.
   */
  hints = /* @__PURE__ */ new Map();
  constructor(name) {
    this.proto = create(CpModelProtoSchema, { name: name ?? "" });
  }
  // ── Variable creation ──
  newIntVar(lb, ub, name) {
    const index = this.proto.variables.length;
    this.proto.variables.push(create(IntegerVariableProtoSchema, {
      name,
      domain: [BigInt(lb), BigInt(ub)]
    }));
    return new IntVar(index, name);
  }
  newBoolVar(name) {
    const index = this.proto.variables.length;
    this.proto.variables.push(create(IntegerVariableProtoSchema, {
      name,
      domain: [0n, 1n]
    }));
    return new BoolVar(index, name);
  }
  newConstant(value) {
    const v = BigInt(value);
    const name = `const_${v}`;
    const index = this.proto.variables.length;
    this.proto.variables.push(create(IntegerVariableProtoSchema, {
      name,
      domain: [v, v]
    }));
    return new IntVar(index, name);
  }
  // ── Interval creation ──
  newIntervalVar(start, size, end, name) {
    const ct = this.addConstraintProto();
    ct.name = name;
    ct.constraint = {
      case: "interval",
      value: create(IntervalConstraintProtoSchema, {
        start: toLinearExpr(start).toProto(),
        size: toLinearExpr(size).toProto(),
        end: toLinearExpr(end).toProto()
      })
    };
    return new IntervalVar(this.proto.constraints.length - 1, name);
  }
  // ── Constraints ──
  /** Add a bounded linear constraint: lb <= expr <= ub */
  add(bounded) {
    const ct = this.addConstraintProto();
    const vars = [];
    const coeffs = [];
    for (const [varIdx, coeff] of bounded.expr.terms) {
      vars.push(varIdx);
      coeffs.push(coeff);
    }
    ct.constraint = {
      case: "linear",
      value: create(LinearConstraintProtoSchema, {
        vars,
        coeffs,
        domain: [bounded.lb - bounded.expr.offset, bounded.ub - bounded.expr.offset]
      })
    };
    return new Constraint(ct);
  }
  addLinearConstraint(expr, lb, ub) {
    const linearExpr = toLinearExpr(expr);
    return this.add(new BoundedLinearExpression(linearExpr, BigInt(lb), BigInt(ub)));
  }
  addAllDifferent(exprs) {
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "allDiff",
      value: create(AllDifferentConstraintProtoSchema, {
        exprs: exprs.map((e) => toLinearExpr(e).toProto())
      })
    };
    return new Constraint(ct);
  }
  addBoolOr(literals) {
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "boolOr",
      value: create(BoolArgumentProtoSchema, {
        literals: literals.map((lit) => typeof lit === "number" ? lit : lit.index)
      })
    };
    return new Constraint(ct);
  }
  addBoolAnd(literals) {
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "boolAnd",
      value: create(BoolArgumentProtoSchema, {
        literals: literals.map((lit) => typeof lit === "number" ? lit : lit.index)
      })
    };
    return new Constraint(ct);
  }
  addNoOverlap(intervals) {
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "noOverlap",
      value: create(NoOverlapConstraintProtoSchema, {
        intervals: intervals.map((iv) => iv.constraintIndex)
      })
    };
    return new Constraint(ct);
  }
  addCircuit(arcs) {
    const tails = [];
    const heads = [];
    const literals = [];
    for (const [tail, head, lit] of arcs) {
      tails.push(tail);
      heads.push(head);
      literals.push(typeof lit === "number" ? lit : lit.index);
    }
    const ct = this.addConstraintProto();
    ct.constraint = {
      case: "circuit",
      value: create(CircuitConstraintProtoSchema, { tails, heads, literals })
    };
    return new Constraint(ct);
  }
  // ── Objective ──
  minimize(expr) {
    this.setObjective(expr, false);
  }
  maximize(expr) {
    this.setObjective(expr, true);
  }
  // ── Hints ──
  /**
   * Suggest a value for a variable, tried before the search proper begins.
   *
   * A hint is advisory. It does not constrain anything: a wrong one costs search
   * time and nothing else, and cannot change the optimal value. So this is a way
   * to say "start from here", not a way to fix a variable — use `add(v.equals(n))`
   * for that.
   *
   * Hints may be partial, and usually should be. Naming the few variables that
   * decide a solution lets propagation derive the rest, which is both less work to
   * build and less to get wrong than spelling out every variable.
   */
  addHint(variable, value) {
    this.hints.set(variable.index, BigInt(value));
  }
  /** Forget every hint added so far. */
  clearHints() {
    this.hints.clear();
  }
  // ── Serialization ──
  toProto() {
    this.proto.solutionHint = this.hints.size ? create(PartialVariableAssignmentSchema, {
      vars: [...this.hints.keys()],
      values: [...this.hints.values()]
    }) : void 0;
    return this.proto;
  }
  // ── Internal ──
  addConstraintProto() {
    const ct = create(ConstraintProtoSchema, {});
    this.proto.constraints.push(ct);
    return ct;
  }
  setObjective(expr, maximize) {
    const linearExpr = toLinearExpr(expr);
    const vars = [];
    const coeffs = [];
    for (const [varIdx, coeff] of linearExpr.terms) {
      vars.push(varIdx);
      coeffs.push(maximize ? -coeff : coeff);
    }
    this.proto.objective = create(CpObjectiveProtoSchema, {
      vars,
      coeffs,
      offset: maximize ? -Number(linearExpr.offset) : Number(linearExpr.offset),
      scalingFactor: maximize ? -1 : 1
    });
  }
};

// vendor/cpsat-js/dist/model/domain.js
var Domain = class _Domain {
  intervals;
  constructor(intervals) {
    this.intervals = intervals;
  }
  static fromRange(min, max) {
    return new _Domain([[BigInt(min), BigInt(max)]]);
  }
  static fromValues(values) {
    if (values.length === 0) {
      return new _Domain([]);
    }
    const sorted = [...values].map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const intervals = [];
    let start = sorted[0];
    let end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1n) {
        end = sorted[i];
      } else {
        intervals.push([start, end]);
        start = sorted[i];
        end = sorted[i];
      }
    }
    intervals.push([start, end]);
    return new _Domain(intervals);
  }
  static fromFlattenedIntervals(flat) {
    const intervals = [];
    for (let i = 0; i < flat.length; i += 2) {
      intervals.push([flat[i], flat[i + 1]]);
    }
    return new _Domain(intervals);
  }
  toFlatBigIntArray() {
    return this.intervals.flatMap(([min, max]) => [min, max]);
  }
};

// vendor/cpsat-js/dist/index.portable.js
setGlueLoader(makeGlueLoader(
  // @ts-expect-error Emscripten-generated ESM glue; no TS declarations.
  () => Promise.resolve().then(() => (init_cpsat(), cpsat_exports)),
  () => new URL("../build/portable/cpsat.wasm", import.meta.url).href
), false);
export {
  BoolVar,
  BoundedLinearExpression,
  Constraint,
  CpModel,
  CpSolver,
  CpSolverStatus,
  Domain,
  IntVar,
  IntervalVar,
  LinearExpr
};
