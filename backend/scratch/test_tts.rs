use std::env;

#[tokio::main]
async fn main() {
    let auth_manager = gcp_auth::provider().await.unwrap();
    let token = auth_manager.token(&["https://www.googleapis.com/auth/cloud-platform"]).await.unwrap();
    println!("Token: {}", token.as_str());

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "input": {"text": "Hello world"},
        "voice": {"languageCode": "en-US", "name": "Aoede"},
        "audioConfig": {"audioEncoding": "MP3"}
    });

    let res = client.post("https://texttospeech.googleapis.com/v1/text:synthesize")
        .header("Authorization", format!("Bearer {}", token.as_str()))
        .json(&payload)
        .send().await.unwrap();
        
    println!("Status: {}", res.status());
    println!("Body: {}", res.text().await.unwrap());
}
