#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    unordered_map<string, int> seen;
    seen.reserve(n * 2 + 1);
    string code, out;
    out.reserve(n * 7);
    long long pairs = 0;
    for (int i = 0; i < n; i++) {
        cin >> code;
        string key;
        for (char ch : code) {
            if (ch == '-') continue;
            key += (char)toupper((unsigned char)ch);
        }
        int &count = seen[key];
        if (i) out += ' ';
        out += to_string(count);
        pairs += count;
        count++;
    }
    out += '\n';
    cout << out << seen.size() << ' ' << pairs << '\n';
    return 0;
}
