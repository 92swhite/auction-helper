use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{self, Read},
    path::PathBuf,
};

#[derive(Deserialize)]
struct Request {
    action: String,
    #[serde(default)]
    payload: Value,
}

fn main() {
    let result = (|| -> Result<Value, String> {
        let path = std::env::args()
            .nth(1)
            .map(PathBuf::from)
            .ok_or("Usage: auction-core <database-path>; JSON request on stdin")?;
        let mut input = String::new();
        io::stdin()
            .take(2_000_001)
            .read_to_string(&mut input)
            .map_err(|e| e.to_string())?;
        if input.len() > 2_000_000 {
            return Err("Request is too large.".into());
        }
        let req: Request = serde_json::from_str(&input).map_err(|e| e.to_string())?;
        auction_core::Store::open(&path)?.dispatch(&req.action, req.payload)
    })();
    match result {
        Ok(data) => println!("{}", json!({"data": data})),
        Err(error) => {
            println!("{}", json!({"error": error}));
            std::process::exit(1);
        }
    }
}
