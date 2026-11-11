use std::sync::atomic::{AtomicBool, Ordering};

/// Only a completed frontend save/discard transaction authorizes application exit.
#[derive(Default)]
pub struct ExitGuard {
    approved: AtomicBool,
}

impl ExitGuard {
    pub fn approve(&self) {
        self.approved.store(true, Ordering::SeqCst);
    }

    pub fn needs_confirmation(&self, has_main_window: bool) -> bool {
        has_main_window && !self.approved.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unapproved_exit_is_intercepted_while_the_document_window_exists() {
        let guard = ExitGuard::default();
        assert!(guard.needs_confirmation(true));
        // A cancelled prompt leaves the gate closed for the next quit request.
        assert!(guard.needs_confirmation(true));
    }

    #[test]
    fn approved_exit_is_not_intercepted_again() {
        let guard = ExitGuard::default();
        guard.approve();
        assert!(!guard.needs_confirmation(true));
        assert!(!guard.needs_confirmation(false));
    }

    #[test]
    fn a_destroyed_window_does_not_leave_a_headless_process() {
        let guard = ExitGuard::default();
        assert!(!guard.needs_confirmation(false));
    }
}
