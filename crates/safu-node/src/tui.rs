//! The optional full-screen dashboard (`safu-node tui`): a live, read-only view
//! of what this node holds — its identity, linked devices (with safety numbers),
//! and how much of the referenced ciphertext has been replicated — refreshed
//! from the data dir once a second.
//!
//! It is the terminal-native counterpart of `status`/`files`: run `serve` in one
//! terminal and `tui` in another to watch a node sync in real time. Like those
//! commands it reads the data dir without binding the transport (`serve`
//! persists the document on every applied delta), so it never touches the
//! network and is safe to run alongside a serving node. Press `q` (or Esc /
//! Ctrl-C) to quit; the terminal is always restored, even on error.

use std::io::{self, IsTerminal};
use std::path::Path;
use std::time::Duration;

use ratatui::backend::{Backend, CrosstermBackend};
use ratatui::crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use ratatui::crossterm::execute;
use ratatui::crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Cell, Paragraph, Row, Table};
use ratatui::{Frame, Terminal};

use crate::config::Devices;
use crate::sas::safety_number;
use crate::store::{load_doc, FsBlockStore};
use crate::{human_size, short};

const REFRESH: Duration = Duration::from_millis(1000);

/// Drive the dashboard: set up the alternate screen + raw mode, loop drawing the
/// live snapshot and polling for a quit key, then restore the terminal. `sign_id`
/// is this node's signing id — needed to compute each device's safety number.
pub fn run(data_dir: &Path, sign_id: &str) -> Result<(), String> {
    if !io::stdout().is_terminal() {
        return Err(
            "the dashboard needs an interactive terminal; use `status` for a one-shot snapshot"
                .into(),
        );
    }

    enable_raw_mode().map_err(|e| format!("enter raw mode: {e}"))?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen).map_err(|e| format!("enter alternate screen: {e}"))?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend).map_err(|e| format!("init terminal: {e}"))?;

    let outcome = event_loop(&mut terminal, data_dir, sign_id);

    // Restore the terminal no matter how the loop ended, so a failure mid-draw
    // never leaves the user's shell in raw mode or on the alternate screen.
    let _ = disable_raw_mode();
    let _ = execute!(terminal.backend_mut(), LeaveAlternateScreen);
    let _ = terminal.show_cursor();
    outcome
}

fn event_loop<B: Backend>(
    terminal: &mut Terminal<B>,
    data_dir: &Path,
    sign_id: &str,
) -> Result<(), String> {
    loop {
        let board = Dashboard::gather(data_dir, sign_id);
        terminal
            .draw(|frame| draw(frame, data_dir, &board))
            .map_err(|e| format!("draw: {e}"))?;

        // Block for at most one refresh interval; a key press wakes us early so
        // quitting feels instant, otherwise we fall through and redraw.
        if event::poll(REFRESH).map_err(|e| format!("poll input: {e}"))? {
            if let Event::Key(key) = event::read().map_err(|e| format!("read input: {e}"))? {
                if key.kind == KeyEventKind::Press && is_quit(key) {
                    return Ok(());
                }
            }
        }
    }
}

/// Quit on `q`, Esc, or Ctrl-C — the conventional ways out of a full-screen app.
fn is_quit(key: KeyEvent) -> bool {
    matches!(key.code, KeyCode::Char('q') | KeyCode::Esc)
        || (key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c'))
}

/// One device row in the dashboard: its signing id, the safety number to match
/// against the device's screen, and its home relay.
struct DeviceRow {
    sign_id: String,
    sas: String,
    relay: String,
}

/// One backed-up file: its size, how many blocks it references, and its path.
struct FileRow {
    size: i64,
    blocks: usize,
    path: String,
}

/// An offline snapshot of the node's state, gathered fresh each refresh from the
/// data dir — the same numbers `status`/`files` print, in one screen.
struct Dashboard {
    files: usize,
    total_size: i64,
    referenced: usize,
    present: usize,
    missing: usize,
    pins: usize,
    held: usize,
    devices: Vec<DeviceRow>,
    file_rows: Vec<FileRow>,
}

impl Dashboard {
    /// Read the document, block store, and linked devices, deriving the same
    /// replication stats as `cmd_status` plus the file list of `cmd_files`. A
    /// missing or unreadable doc is treated as empty, so the dashboard renders
    /// from the very first tick rather than erroring on a fresh node.
    fn gather(data_dir: &Path, sign_id: &str) -> Self {
        let snapshot = load_doc(&data_dir.join("doc.json"))
            .unwrap_or_default()
            .unwrap_or_default();
        let store = FsBlockStore::new(data_dir.join("blocks"));

        let mut file_rows: Vec<FileRow> = snapshot
            .entries
            .iter()
            .filter(|e| !e.entry.deleted)
            .map(|e| FileRow {
                size: e.entry.size,
                blocks: e.entry.blocks.len(),
                path: e.path.clone(),
            })
            .collect();
        file_rows.sort_by(|a, b| a.path.cmp(&b.path));
        let total_size: i64 = file_rows.iter().map(|f| f.size).sum();

        // Distinct blocks the live table references; how many the store already
        // holds tells us replication progress. Blocks held but unreferenced are
        // public-share pins (they live outside the allocation table).
        let mut referenced = std::collections::HashSet::new();
        for entry in snapshot.entries.iter().filter(|e| !e.entry.deleted) {
            for hash in &entry.entry.blocks {
                referenced.insert(hash.as_str());
            }
        }
        let present = referenced.iter().filter(|hash| store.has(hash)).count();
        let held = store.count();

        // A missing/unreadable devices file is treated as "no devices" rather
        // than an error, so the dashboard still renders.
        let device_rows = Devices::load(data_dir)
            .map(|devices| {
                devices
                    .list()
                    .iter()
                    .map(|device| DeviceRow {
                        sign_id: device.sign_id.clone(),
                        sas: safety_number(sign_id, &device.sign_id),
                        relay: device.relay_url.clone().unwrap_or_else(|| "(none)".into()),
                    })
                    .collect()
            })
            .unwrap_or_default();

        Self {
            files: file_rows.len(),
            total_size,
            referenced: referenced.len(),
            present,
            missing: referenced.len() - present,
            pins: held.saturating_sub(present),
            held,
            devices: device_rows,
            file_rows,
        }
    }
}

const ACCENT: Color = Color::Cyan;

fn draw(frame: &mut Frame, data_dir: &Path, board: &Dashboard) {
    let areas = Layout::vertical([
        Constraint::Length(2), // header
        Constraint::Length(4), // stats
        // Borders (2) + header row (1) + one line per device (capped at 6).
        Constraint::Length((board.devices.len() as u16).clamp(1, 6) + 3), // devices
        Constraint::Min(3),                                               // files
        Constraint::Length(1),                                            // footer
    ])
    .split(frame.area());

    let header = Paragraph::new(Line::from(vec![
        Span::styled(
            "safu node",
            Style::default().fg(ACCENT).add_modifier(Modifier::BOLD),
        ),
        Span::raw("  ·  live dashboard  ·  "),
        Span::styled(
            data_dir.display().to_string(),
            Style::default().fg(Color::DarkGray),
        ),
    ]));
    frame.render_widget(header, areas[0]);

    frame.render_widget(stats(board), areas[1]);
    frame.render_widget(devices_table(board), areas[2]);
    frame.render_widget(files_table(board), areas[3]);

    let footer = Paragraph::new(Span::styled(
        "q / Esc to quit  ·  refreshes every second  ·  read-only, offline snapshot",
        Style::default().fg(Color::DarkGray),
    ));
    frame.render_widget(footer, areas[4]);
}

fn stats(board: &Dashboard) -> Paragraph<'static> {
    let label = |text: &'static str| Span::styled(text, Style::default().fg(Color::Gray));
    let value = |text: String| Span::styled(text, Style::default().add_modifier(Modifier::BOLD));
    let lines = vec![
        Line::from(vec![
            label("backed-up files:   "),
            value(format!(
                "{} ({})",
                board.files,
                human_size(board.total_size)
            )),
        ]),
        Line::from(vec![
            label("referenced blocks: "),
            value(format!("{}", board.referenced)),
            Span::styled(
                format!(
                    "  ({} present, {} replicating)",
                    board.present, board.missing
                ),
                Style::default().fg(if board.missing == 0 {
                    Color::Green
                } else {
                    Color::Yellow
                }),
            ),
        ]),
        Line::from(vec![
            label("share-pin blocks:  "),
            value(format!("{}", board.pins)),
            label("    total held: "),
            value(format!("{}", board.held)),
        ]),
    ];
    Paragraph::new(lines)
}

fn devices_table(board: &Dashboard) -> Table<'static> {
    let block = Block::default()
        .borders(Borders::ALL)
        .title(format!(" linked devices ({}) ", board.devices.len()));
    if board.devices.is_empty() {
        return Table::new(
            [Row::new([Cell::from(
                "none — run `safu-node link <code>` to add one",
            )])],
            [Constraint::Percentage(100)],
        )
        .block(block);
    }
    let rows = board.devices.iter().map(|device| {
        Row::new([
            Cell::from(short(&device.sign_id).to_string()),
            Cell::from(Span::styled(
                device.sas.clone(),
                Style::default().fg(ACCENT),
            )),
            Cell::from(device.relay.clone()),
        ])
    });
    Table::new(
        rows,
        [
            Constraint::Length(14),
            Constraint::Length(10),
            Constraint::Min(10),
        ],
    )
    .header(Row::new(["device", "safety no.", "relay"]).style(Style::default().fg(Color::DarkGray)))
    .block(block)
}

fn files_table(board: &Dashboard) -> Table<'static> {
    let block = Block::default()
        .borders(Borders::ALL)
        .title(format!(" backed-up files ({}) ", board.files));
    if board.file_rows.is_empty() {
        return Table::new(
            [Row::new([Cell::from(
                "no files yet — pair a device and back something up",
            )])],
            [Constraint::Percentage(100)],
        )
        .block(block);
    }
    let rows = board.file_rows.iter().map(|file| {
        Row::new([
            Cell::from(human_size(file.size)),
            Cell::from(format!("{}", file.blocks)),
            Cell::from(file.path.clone()),
        ])
    });
    Table::new(
        rows,
        [
            Constraint::Length(12),
            Constraint::Length(8),
            Constraint::Min(10),
        ],
    )
    .header(Row::new(["size", "blocks", "path"]).style(Style::default().fg(Color::DarkGray)))
    .block(block)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::backend::TestBackend;

    fn sample() -> Dashboard {
        Dashboard {
            files: 2,
            total_size: 3 * 1024 * 1024,
            referenced: 5,
            present: 4,
            missing: 1,
            pins: 2,
            held: 6,
            devices: vec![DeviceRow {
                sign_id: "abcdef0123456789".into(),
                sas: "12 345 678".into(),
                relay: "https://relay.example/".into(),
            }],
            file_rows: vec![
                FileRow {
                    size: 1024 * 1024,
                    blocks: 2,
                    path: "notes/todo.txt".into(),
                },
                FileRow {
                    size: 2 * 1024 * 1024,
                    blocks: 3,
                    path: "photos/cat.png".into(),
                },
            ],
        }
    }

    /// Render one frame to a fixed-size test backend and flatten it to lines.
    fn render(board: &Dashboard) -> Vec<String> {
        let mut terminal = Terminal::new(TestBackend::new(72, 22)).expect("test terminal");
        terminal
            .draw(|frame| draw(frame, Path::new("./safu-node-data"), board))
            .expect("draw");
        let buffer = terminal.backend().buffer().clone();
        (0..buffer.area.height)
            .map(|y| {
                (0..buffer.area.width)
                    .map(|x| buffer[(x, y)].symbol())
                    .collect::<String>()
            })
            .collect()
    }

    #[test]
    fn renders_identity_devices_and_files() {
        let lines = render(&sample());
        let screen = lines.join("\n");
        // Visible when run with `cargo test -- --nocapture`.
        eprintln!("\n{screen}\n");

        assert!(screen.contains("safu node"), "header");
        assert!(screen.contains("./safu-node-data"), "data dir");
        assert!(screen.contains("backed-up files:"), "stats");
        assert!(
            screen.contains("4 present, 1 replicating"),
            "replication progress"
        );
        assert!(screen.contains("linked devices (1)"), "devices title");
        assert!(screen.contains("12 345 678"), "safety number");
        assert!(screen.contains("backed-up files (2)"), "files title");
        assert!(screen.contains("notes/todo.txt"), "a file path");
        assert!(screen.contains("q / Esc to quit"), "footer");
    }

    #[test]
    fn empty_node_renders_guidance_not_a_crash() {
        let board = Dashboard {
            files: 0,
            total_size: 0,
            referenced: 0,
            present: 0,
            missing: 0,
            pins: 0,
            held: 0,
            devices: vec![],
            file_rows: vec![],
        };
        let screen = render(&board).join("\n");
        assert!(screen.contains("linked devices (0)"));
        assert!(screen.contains("no files yet"));
    }

    #[test]
    fn ctrl_c_q_and_esc_quit_but_other_keys_do_not() {
        use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
        let press = |code, mods| KeyEvent::new(code, mods);
        assert!(is_quit(press(KeyCode::Char('q'), KeyModifiers::NONE)));
        assert!(is_quit(press(KeyCode::Esc, KeyModifiers::NONE)));
        assert!(is_quit(press(KeyCode::Char('c'), KeyModifiers::CONTROL)));
        assert!(!is_quit(press(KeyCode::Char('c'), KeyModifiers::NONE)));
        assert!(!is_quit(press(KeyCode::Char('x'), KeyModifiers::NONE)));
    }
}
