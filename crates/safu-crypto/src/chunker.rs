//! Streaming content-defined chunker (plan §1.2). Bytes are pushed in arbitrary
//! windows; chunk boundaries are determined by FastCDC and are independent of
//! how the input is split across `push` calls (streaming invariance). Buffered
//! data never exceeds the maximum chunk size, keeping memory bounded.

use fastcdc::v2020::FastCDC;

pub struct Chunker {
    buf: Vec<u8>,
    min: usize,
    avg: usize,
    max: usize,
}

impl Chunker {
    pub fn new(min: usize, avg: usize, max: usize) -> Self {
        Self { buf: Vec::new(), min, avg, max }
    }

    /// Append `data` and return every chunk whose boundary is now final.
    pub fn push(&mut self, data: &[u8]) -> Vec<Vec<u8>> {
        self.buf.extend_from_slice(data);
        let mut out = Vec::new();
        while let Some(len) = self.next_final_boundary() {
            out.push(self.buf.drain(..len).collect());
        }
        out
    }

    /// Flush the remaining buffer as final chunks.
    pub fn finish(&mut self) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        if self.buf.is_empty() {
            return out;
        }
        let lengths: Vec<usize> =
            FastCDC::new(&self.buf, self.min as u32, self.avg as u32, self.max as u32)
                .map(|c| c.length)
                .collect();
        for len in lengths {
            out.push(self.buf.drain(..len).collect());
        }
        out
    }

    /// Length of the first chunk if its boundary cannot change with more input.
    /// A FastCDC cut depends only on bytes up to the cut, so a boundary strictly
    /// inside the buffer (or one forced at `max`) is final; a single chunk that
    /// spans the whole buffer below `max` may still move and is withheld.
    fn next_final_boundary(&self) -> Option<usize> {
        if self.buf.len() < self.min {
            return None;
        }
        let first = FastCDC::new(&self.buf, self.min as u32, self.avg as u32, self.max as u32)
            .next()?
            .length;
        if first < self.buf.len() || first >= self.max {
            Some(first)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: usize = 1024;
    const AVG: usize = 4096;
    const MAX: usize = 16384;

    /// Deterministic pseudo-random bytes (xorshift) — reproducible without deps.
    fn pseudo(len: usize, seed: u64) -> Vec<u8> {
        let mut x = seed | 1;
        (0..len)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                (x >> 24) as u8
            })
            .collect()
    }

    fn chunk_all(data: &[u8], window: usize) -> Vec<Vec<u8>> {
        let mut c = Chunker::new(MIN, AVG, MAX);
        let mut out = Vec::new();
        for w in data.chunks(window) {
            out.extend(c.push(w));
        }
        out.extend(c.finish());
        out
    }

    #[test]
    fn chunks_reassemble_to_input() {
        let data = pseudo(200_000, 42);
        let chunks = chunk_all(&data, data.len());
        let joined: Vec<u8> = chunks.concat();
        assert_eq!(joined, data);
        assert!(chunks.len() > 1, "expected multiple chunks");
    }

    #[test]
    fn boundaries_are_invariant_to_push_windowing() {
        let data = pseudo(200_000, 7);
        let one_shot = chunk_all(&data, data.len());
        let dribbled = chunk_all(&data, 100); // tiny windows
        let odd = chunk_all(&data, 4097); // unaligned windows

        let lens = |cs: &[Vec<u8>]| cs.iter().map(|c| c.len()).collect::<Vec<_>>();
        assert_eq!(lens(&one_shot), lens(&dribbled));
        assert_eq!(lens(&one_shot), lens(&odd));
    }

    #[test]
    fn respects_max_chunk_size() {
        let data = pseudo(200_000, 99);
        for chunk in chunk_all(&data, 8192) {
            assert!(chunk.len() <= MAX, "chunk exceeded max: {}", chunk.len());
        }
    }

    #[test]
    fn small_input_yields_single_chunk() {
        let data = pseudo(500, 3); // below MIN
        let chunks = chunk_all(&data, data.len());
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], data);
    }

    #[test]
    fn empty_input_yields_no_chunks() {
        let chunks = chunk_all(b"", 64);
        assert!(chunks.is_empty());
    }
}
