#[cfg(feature = "flashcards")]
pub mod assets;
#[cfg(feature = "flashcards")]
pub mod decks;
pub mod features;
#[cfg(feature = "flashcards")]
pub mod generation;
pub mod health;
pub mod notifications;
pub mod tutor;

#[cfg(feature = "pronoun_practice")]
pub mod pronoun_practice;

#[cfg(feature = "auth")]
pub mod auth;

#[cfg(feature = "auth")]
pub mod presence;

#[cfg(feature = "auth")]
pub mod admin_users;

#[cfg(feature = "subscriptions")]
pub mod admin;
