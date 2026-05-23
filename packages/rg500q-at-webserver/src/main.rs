use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::{Duration, Instant};

const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

#[derive(Clone, Debug)]
struct Config {
    enabled: bool,
    listen_host: String,
    websocket_port: u16,
    serial_port: String,
    serial_timeout_ms: u64,
    auth_key: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: true,
            listen_host: "0.0.0.0".to_string(),
            websocket_port: 8765,
            serial_port: "/dev/ttyUSB2".to_string(),
            serial_timeout_ms: 2500,
            auth_key: String::new(),
        }
    }
}

fn main() -> io::Result<()> {
    let config = Config::load();
    if !config.enabled {
        log("service disabled");
        return Ok(());
    }

    let addr = format!("{}:{}", config.listen_host, config.websocket_port);
    let listener = TcpListener::bind(&addr)?;
    log(&format!("listening on {}", addr));

    for conn in listener.incoming() {
        match conn {
            Ok(stream) => {
                let cfg = config.clone();
                thread::spawn(move || {
                    if let Err(err) = handle_client(stream, cfg) {
                        log(&format!("client error: {}", err));
                    }
                });
            }
            Err(err) => log(&format!("accept error: {}", err)),
        }
    }

    Ok(())
}

impl Config {
    fn load() -> Self {
        let mut cfg = Self::default();
        let content = fs::read_to_string("/etc/config/rg500q-at-webserver").unwrap_or_default();
        for raw in content.lines() {
            let line = raw.trim();
            if !line.starts_with("option ") {
                continue;
            }
            let mut parts = line.splitn(3, char::is_whitespace);
            parts.next();
            let key = parts.next().unwrap_or("").trim();
            let value = unquote(parts.next().unwrap_or("").trim());
            match key {
                "enabled" => cfg.enabled = value != "0",
                "listen_host" => cfg.listen_host = value,
                "websocket_port" => cfg.websocket_port = value.parse().unwrap_or(8765),
                "serial_port" => cfg.serial_port = value,
                "serial_timeout_ms" => cfg.serial_timeout_ms = value.parse().unwrap_or(2500),
                "auth_key" => cfg.auth_key = value,
                _ => {}
            }
        }
        cfg
    }
}

fn handle_client(mut stream: TcpStream, cfg: Config) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_write_timeout(Some(Duration::from_secs(10)))?;
    websocket_handshake(&mut stream)?;

    loop {
        let msg = match read_ws_text(&mut stream) {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(()),
            Err(err) => {
                let _ = write_ws_text(&mut stream, &error_json("", "read", &err.to_string()));
                return Err(err);
            }
        };

        let req = Request::parse(&msg);
        if !cfg.auth_key.is_empty() && req.get("auth").unwrap_or_default() != cfg.auth_key {
            write_ws_text(&mut stream, &error_json(&req.id(), &req.action(), "auth failed"))?;
            continue;
        }

        let response = handle_request(&cfg, &req);
        write_ws_text(&mut stream, &response)?;
    }
}

fn websocket_handshake(stream: &mut TcpStream) -> io::Result<()> {
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf)?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let mut key = "";
    for line in req.lines() {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("sec-websocket-key:") {
            key = line.split_once(':').map(|(_, v)| v.trim()).unwrap_or("");
            break;
        }
    }
    if key.is_empty() {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "missing Sec-WebSocket-Key"));
    }

    let accept = websocket_accept(key);
    let response = format!(
        "HTTP/1.1 101 Switching Protocols\r\n\
         Upgrade: websocket\r\n\
         Connection: Upgrade\r\n\
         Sec-WebSocket-Accept: {}\r\n\r\n",
        accept
    );
    stream.write_all(response.as_bytes())
}

fn read_ws_text(stream: &mut TcpStream) -> io::Result<Option<String>> {
    let mut hdr = [0u8; 2];
    if let Err(err) = stream.read_exact(&mut hdr) {
        if err.kind() == io::ErrorKind::UnexpectedEof {
            return Ok(None);
        }
        return Err(err);
    }

    let opcode = hdr[0] & 0x0f;
    if opcode == 0x8 {
        return Ok(None);
    }
    if opcode != 0x1 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "only text frames are supported"));
    }

    let masked = (hdr[1] & 0x80) != 0;
    let mut len = (hdr[1] & 0x7f) as u64;
    if len == 126 {
        let mut ext = [0u8; 2];
        stream.read_exact(&mut ext)?;
        len = u16::from_be_bytes(ext) as u64;
    } else if len == 127 {
        let mut ext = [0u8; 8];
        stream.read_exact(&mut ext)?;
        len = u64::from_be_bytes(ext);
    }

    let mut mask = [0u8; 4];
    if masked {
        stream.read_exact(&mut mask)?;
    }

    if len > 256 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame too large"));
    }

    let mut payload = vec![0u8; len as usize];
    stream.read_exact(&mut payload)?;
    if masked {
        for (i, b) in payload.iter_mut().enumerate() {
            *b ^= mask[i % 4];
        }
    }

    String::from_utf8(payload)
        .map(Some)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid utf-8"))
}

fn write_ws_text(stream: &mut TcpStream, text: &str) -> io::Result<()> {
    let bytes = text.as_bytes();
    let mut frame = Vec::with_capacity(bytes.len() + 10);
    frame.push(0x81);
    if bytes.len() < 126 {
        frame.push(bytes.len() as u8);
    } else if bytes.len() <= 65535 {
        frame.push(126);
        frame.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(bytes.len() as u64).to_be_bytes());
    }
    frame.extend_from_slice(bytes);
    stream.write_all(&frame)
}

#[derive(Debug)]
struct Request {
    values: HashMap<String, String>,
}

impl Request {
    fn parse(raw: &str) -> Self {
        Self {
            values: parse_flat_json(raw),
        }
    }

    fn get(&self, key: &str) -> Option<String> {
        self.values.get(key).cloned()
    }

    fn id(&self) -> String {
        self.get("id").unwrap_or_default()
    }

    fn action(&self) -> String {
        self.get("action").unwrap_or_else(|| "at".to_string())
    }
}

fn handle_request(cfg: &Config, req: &Request) -> String {
    let id = req.id();
    let action = req.action();
    let cmd = match build_command(&action, req) {
        Ok(cmd) => cmd,
        Err(err) => return error_json(&id, &action, &err),
    };

    match send_at(&cfg.serial_port, &cmd, cfg.serial_timeout_ms) {
        Ok(raw) => ok_json(&id, &action, &cmd, &raw),
        Err(err) => error_json(&id, &action, &err.to_string()),
    }
}

fn build_command(action: &str, req: &Request) -> Result<String, String> {
    match action {
        "at" => req.get("cmd").filter(|s| !s.trim().is_empty()).ok_or("missing cmd".to_string()),
        "serving_cell" | "get_serving_cell" => Ok(r#"AT+QENG="servingcell""#.to_string()),
        "neighbor_cells" | "scan_neighbor" => {
            Ok(r#"AT+QENG="neighbourcell";+QNWCFG="nr5g_meas_info",1;+QNWCFG="nr5g_meas_info""#.to_string())
        }
        "get_mode" => Ok(r#"AT+QNWPREFCFG="mode_pref""#.to_string()),
        "set_mode" => {
            let mode = required(req, "mode")?;
            match mode.as_str() {
                "AUTO" | "LTE" | "NR5G" | "WCDMA" | "NR5G:LTE:WCDMA" | "LTE:WCDMA" => {
                    Ok(format!(r#"AT+QNWPREFCFG="mode_pref",{}"#, mode))
                }
                _ => Err("unsupported mode".to_string()),
            }
        }
        "get_rat_order" => Ok(r#"AT+QNWPREFCFG="rat_acq_order""#.to_string()),
        "set_rat_order" => {
            let order = required(req, "order")?;
            Ok(format!(r#"AT+QNWPREFCFG="rat_acq_order",{}"#, order))
        }
        "get_roam" => Ok(r#"AT+QNWPREFCFG="roam_pref""#.to_string()),
        "set_roam" => {
            let value = required(req, "value")?;
            match value.as_str() {
                "1" | "255" => Ok(format!(r#"AT+QNWPREFCFG="roam_pref",{}"#, value)),
                _ => Err("roam value must be 1 or 255".to_string()),
            }
        }
        "get_srv_domain" => Ok(r#"AT+QNWPREFCFG="srv_domain""#.to_string()),
        "set_srv_domain" => {
            let value = required(req, "value")?;
            match value.as_str() {
                "0" | "1" | "2" => Ok(format!(r#"AT+QNWPREFCFG="srv_domain",{}"#, value)),
                _ => Err("srv_domain value must be 0, 1 or 2".to_string()),
            }
        }
        "get_sim_slot" => Ok("AT+QUIMSLOT?".to_string()),
        "set_sim_slot" => {
            let slot = required(req, "slot")?;
            match slot.as_str() {
                "1" | "2" => Ok(format!("AT+QUIMSLOT={}", slot)),
                _ => Err("slot must be 1 or 2".to_string()),
            }
        }
        "get_eth_driver" => Ok(r#"AT+QETH="eth_driver""#.to_string()),
        "airplane_on" => Ok("AT+CFUN=0".to_string()),
        "airplane_off" => Ok("AT+CFUN=1".to_string()),
        "reboot_modem" => Ok("AT+CFUN=1,1".to_string()),
        "clear_lock" => {
            let rat = req.get("rat").unwrap_or_else(|| "5g".to_string()).to_ascii_lowercase();
            match rat.as_str() {
                "5g" | "nr5g" => Ok(r#"AT+QNWLOCK="common/5g",0"#.to_string()),
                "4g" | "lte" => Ok(r#"AT+QNWLOCK="common/4g",0"#.to_string()),
                _ => Err("rat must be 5g or 4g".to_string()),
            }
        }
        "lock_5g_cell" => {
            let pci = required(req, "pci")?;
            let arfcn = required(req, "arfcn")?;
            let scs = required(req, "scs")?;
            let band = required(req, "band")?;
            numeric(&pci, "pci")?;
            numeric(&arfcn, "arfcn")?;
            numeric(&scs, "scs")?;
            numeric(&band, "band")?;
            Ok(format!(r#"AT+QNWLOCK="common/5g",{},{},{},{}"#, pci, arfcn, scs, band))
        }
        "lock_4g_cell" => {
            let earfcn = required(req, "earfcn")?;
            let pci = required(req, "pci")?;
            numeric(&earfcn, "earfcn")?;
            numeric(&pci, "pci")?;
            Ok(format!(r#"AT+QNWLOCK="common/4g",1,{},{}"#, earfcn, pci))
        }
        _ => Err(format!("unsupported action: {}", action)),
    }
}

fn send_at(port: &str, cmd: &str, timeout_ms: u64) -> io::Result<String> {
    let mut file = OpenOptions::new().read(true).write(true).open(port)?;
    let command = format!("{}\r", cmd.trim());
    file.write_all(command.as_bytes())?;
    file.flush()?;

    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let mut out = Vec::new();
    let mut buf = [0u8; 512];

    while Instant::now() < deadline {
        match file.read(&mut buf) {
            Ok(0) => thread::sleep(Duration::from_millis(20)),
            Ok(n) => {
                out.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&out);
                if text.contains("\r\nOK\r\n") || text.contains("\nOK\n") || text.contains("ERROR") {
                    break;
                }
            }
            Err(err) if err.kind() == io::ErrorKind::WouldBlock || err.kind() == io::ErrorKind::TimedOut => {
                thread::sleep(Duration::from_millis(20));
            }
            Err(err) => return Err(err),
        }
    }

    Ok(String::from_utf8_lossy(&out).to_string())
}

fn required(req: &Request, key: &str) -> Result<String, String> {
    req.get(key)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| format!("missing {}", key))
}

fn numeric(value: &str, name: &str) -> Result<(), String> {
    if value.chars().all(|c| c.is_ascii_digit()) {
        Ok(())
    } else {
        Err(format!("{} must be numeric", name))
    }
}

fn ok_json(id: &str, action: &str, cmd: &str, raw: &str) -> String {
    format!(
        r#"{{"id":"{}","ok":true,"action":"{}","cmd":"{}","raw":"{}"}}"#,
        json_escape(id),
        json_escape(action),
        json_escape(cmd),
        json_escape(raw)
    )
}

fn error_json(id: &str, action: &str, error: &str) -> String {
    format!(
        r#"{{"id":"{}","ok":false,"action":"{}","error":"{}"}}"#,
        json_escape(id),
        json_escape(action),
        json_escape(error)
    )
}

fn parse_flat_json(input: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len() && bytes[i] != b'"' {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        let (key, ni) = parse_json_string(bytes, i);
        i = ni;
        while i < bytes.len() && (bytes[i].is_ascii_whitespace() || bytes[i] == b':') {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        let value;
        if bytes[i] == b'"' {
            let (v, ni) = parse_json_string(bytes, i);
            value = v;
            i = ni;
        } else {
            let start = i;
            while i < bytes.len() && bytes[i] != b',' && bytes[i] != b'}' {
                i += 1;
            }
            value = String::from_utf8_lossy(&bytes[start..i]).trim().to_string();
        }
        map.insert(key, value);
    }
    map
}

fn parse_json_string(bytes: &[u8], mut i: usize) -> (String, usize) {
    let mut out = String::new();
    i += 1;
    while i < bytes.len() {
        match bytes[i] {
            b'"' => return (out, i + 1),
            b'\\' if i + 1 < bytes.len() => {
                i += 1;
                match bytes[i] {
                    b'"' => out.push('"'),
                    b'\\' => out.push('\\'),
                    b'/' => out.push('/'),
                    b'b' => out.push('\u{0008}'),
                    b'f' => out.push('\u{000c}'),
                    b'n' => out.push('\n'),
                    b'r' => out.push('\r'),
                    b't' => out.push('\t'),
                    other => out.push(other as char),
                }
            }
            b => out.push(b as char),
        }
        i += 1;
    }
    (out, i)
}

fn json_escape(s: &str) -> String {
    let mut out = String::new();
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c.is_control() => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn unquote(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.len() >= 2 {
        let bytes = trimmed.as_bytes();
        if (bytes[0] == b'\'' && bytes[trimmed.len() - 1] == b'\'')
            || (bytes[0] == b'"' && bytes[trimmed.len() - 1] == b'"')
        {
            return trimmed[1..trimmed.len() - 1].to_string();
        }
    }
    trimmed.to_string()
}

fn websocket_accept(key: &str) -> String {
    let mut input = Vec::with_capacity(key.len() + WS_GUID.len());
    input.extend_from_slice(key.as_bytes());
    input.extend_from_slice(WS_GUID.as_bytes());
    base64_encode(&sha1(&input))
}

fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xefcdab89;
    let mut h2: u32 = 0x98badcfe;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xc3d2e1f0;

    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let mut a = h0;
        let mut b = h1;
        let mut c = h2;
        let mut d = h3;
        let mut e = h4;

        for i in 0..80 {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5a827999),
                20..=39 => (b ^ c ^ d, 0x6ed9eba1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8f1bbcdc),
                _ => (b ^ c ^ d, 0xca62c1d6),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(w[i]);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }

    let mut out = [0u8; 20];
    out[0..4].copy_from_slice(&h0.to_be_bytes());
    out[4..8].copy_from_slice(&h1.to_be_bytes());
    out[8..12].copy_from_slice(&h2.to_be_bytes());
    out[12..16].copy_from_slice(&h3.to_be_bytes());
    out[16..20].copy_from_slice(&h4.to_be_bytes());
    out
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i];
        let b1 = if i + 1 < data.len() { data[i + 1] } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] } else { 0 };

        out.push(TABLE[(b0 >> 2) as usize] as char);
        out.push(TABLE[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if i + 1 < data.len() {
            out.push(TABLE[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < data.len() {
            out.push(TABLE[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}

fn log(msg: &str) {
    eprintln!("[rg500q-at-webserver] {}", msg);
}
