use axum::{extract::State, http::StatusCode, response::Json, routing::{get, post}, Router};
use postgrest::Postgrest;
use serde::{Deserialize, Serialize};
use std::{env, sync::Arc};

#[derive(Clone)]
struct AppState {
    supabase: Postgrest,
}

#[derive(Deserialize)]
struct WaitlistSignup {
    email: String,
    handle: Option<String>,
    referred_by: Option<String>,
}

#[derive(Serialize)]
struct WaitlistResponse {
    referral_code: String,
}

async fn root() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "name": "sh1pt-axum-supabase", "version": "0.1.0" }))
}

async fn waitlist(
    State(state): State<Arc<AppState>>,
    Json(signup): Json<WaitlistSignup>,
) -> Result<Json<WaitlistResponse>, StatusCode> {
    let code: String = (0..8).map(|_| format!("{:x}", rand::random::<u8>() % 16)).collect();
    let _ = state
        .supabase
        .from("waitlist")
        .insert(format!(
            r#"{{"email":"{}","handle":{},"referred_by":{},"referral_code":"{}"}}"#,
            signup.email,
            signup.handle.map(|h| format!("\"{}\"", h)).unwrap_or_else(|| "null".into()),
            signup.referred_by.map(|r| format!("\"{}\"", r)).unwrap_or_else(|| "null".into()),
            code
        ))
        .execute()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(WaitlistResponse { referral_code: code }))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info,axum=info").init();

    let supabase_url = env::var("SUPABASE_URL").expect("SUPABASE_URL");
    let service_role = env::var("SUPABASE_SERVICE_ROLE_KEY").expect("SUPABASE_SERVICE_ROLE_KEY");
    let supabase = Postgrest::new(format!("{}/rest/v1", supabase_url))
        .insert_header("apikey", service_role.clone())
        .insert_header("Authorization", format!("Bearer {}", service_role));

    let state = Arc::new(AppState { supabase });

    let app = Router::new()
        .route("/", get(root))
        .route("/waitlist", post(waitlist))
        .with_state(state);

    let port: u16 = env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.unwrap();
    tracing::info!("sh1pt-axum-supabase listening on :{}", port);
    axum::serve(listener, app).await.unwrap();
}
