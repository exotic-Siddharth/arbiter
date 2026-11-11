#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    long long w;
    cin >> n >> w;
    vector<pair<long long, long long>> pieces(n);  // (deadline, firing time)
    for (auto &p : pieces) cin >> p.second >> p.first;
    sort(pieces.begin(), pieces.end());
    // Max-heap of chosen firing times; drop the longest one whenever the newest piece is late.
    priority_queue<long long> heap;
    long long total = 0;
    for (auto &[deadline, t] : pieces) {
        heap.push(t);
        total += t;
        if (w + total > deadline) {
            total -= heap.top();
            heap.pop();
        }
    }
    cout << heap.size() << ' ' << w + total << '\n';
    return 0;
}
