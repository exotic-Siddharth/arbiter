/** Source samples shared by winnow.test.ts and the plagiarism report tests. */

export const CPP_ORIGINAL = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<long long> values(n);
    for (int i = 0; i < n; i++) cin >> values[i];
    long long best = values[0], current = 0;
    for (int i = 0; i < n; i++) {
        current = max(values[i], current + values[i]);
        best = max(best, current);
    }
    cout << best << "\\n";
    return 0;
}
`;

export const CPP_RENAMED_REFORMATTED = `#include <bits/stdc++.h>
using namespace std;
int main()
{
  int count;  cin >> count;
  vector<long long> arr(count);
  for (int k = 0; k < count; k++)
    cin >> arr[k];
  long long answer = arr[0],
            running = 0;
  for (int k = 0; k < count; k++)
  {
    running = max(arr[k], running + arr[k]);
    answer = max(answer, running);
  }
  cout << answer << "\\n";
  return 0;
}
`;

export const CPP_COMMENTED = `#include <bits/stdc++.h>
using namespace std;

// Kadane's algorithm: the best sum of a non-empty subarray.
int main() {
    int n; /* number of values */
    cin >> n;
    vector<long long> values(n);
    for (int i = 0; i < n; i++) cin >> values[i]; // read
    long long best = values[0], current = 0;
    /*
     * current = best sum ending here
     */
    for (int i = 0; i < n; i++) {
        current = max(values[i], current + values[i]);
        best = max(best, current);
    }
    cout << best << "\\n";
    return 0;
}
`;

export const CPP_UNRELATED = `#include <string>
#include <iostream>
#include <map>

struct Trie {
  std::map<char, Trie*> next;
  bool terminal = false;
};

void insert(Trie* root, const std::string& word) {
  Trie* node = root;
  for (char c : word) {
    if (!node->next.count(c)) node->next[c] = new Trie();
    node = node->next[c];
  }
  node->terminal = true;
}

bool contains(Trie* root, const std::string& word) {
  Trie* node = root;
  for (char c : word) {
    auto it = node->next.find(c);
    if (it == node->next.end()) return false;
    node = it->second;
  }
  return node->terminal;
}

int main() {
  Trie root;
  std::string op, word;
  while (std::cin >> op >> word) {
    if (op == "add") insert(&root, word);
    else std::cout << (contains(&root, word) ? "YES" : "NO") << '\\n';
  }
}
`;

export const PY_ORIGINAL = `import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    values = list(map(int, data[1:1 + n]))
    best = values[0]
    current = 0
    for v in values:
        current = max(v, current + v)
        best = max(best, current)
    print(best)

main()
`;

export const PY_RENAMED = `import sys
def main():
  tokens = sys.stdin.read().split()
  size = int(tokens[0])
  nums = list(map(int, tokens[1:1+size]))
  top = nums[0]
  run = 0
  for x in nums:
      run = max(x, run+x)
      top = max(top, run)
  print(top)
main()
`;

export const PY_UNRELATED = `from collections import deque

def bfs(graph, start):
    """Shortest distances from start in an unweighted graph."""
    dist = {start: 0}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        for nxt in graph.get(node, []):
            if nxt not in dist:
                dist[nxt] = dist[node] + 1
                queue.append(nxt)
    return dist

if __name__ == "__main__":
    edges = [line.split() for line in open(0).read().splitlines() if line]
    graph = {}
    for a, b in edges:
        graph.setdefault(a, []).append(b)
        graph.setdefault(b, []).append(a)
    print(sorted(bfs(graph, "1").items()))
`;

/** CPP_ORIGINAL with two added statements and one pre-increment: a near copy (about 0.9). */
export const CPP_EDITED = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<long long> values(n);
    for (int i = 0; i < n; i++) cin >> values[i];
    long long best = values[0], current = 0;
    for (int i = 0; i < n; ++i) {
        current = max(values[i], current + values[i]);
        best = max(best, current);
    }
    cout << best << "\\n";
    return 0;
}
`;
