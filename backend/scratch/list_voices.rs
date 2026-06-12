#[tokio::main]
async fn main() {
    let auth_manager = gcp_auth::provider().await.unwrap();
    let token = auth_manager.token(&["https://www.googleapis.com/auth/cloud-platform"]).await.unwrap();
    let client = reqwest::Client::new();
    let res = client.get("https://texttospeech.googleapis.com/v1/voices")
        .header("Authorization", format!("Bearer {}", token.as_str()))
        .send().await.unwrap();
    println!("{}", res.text().await.unwrap());
}
