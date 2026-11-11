#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int t;
    cin >> t;
    char opener[256] = {};
    opener[(unsigned char)')'] = '(';
    opener[(unsigned char)']'] = '[';
    opener[(unsigned char)'}'] = '{';
    opener[(unsigned char)'>'] = '<';
    string s;
    vector<int> st;
    string out;
    while (t--) {
        cin >> s;
        st.clear();
        size_t depth = 0;
        long long mismatch = -1;
        for (size_t i = 0; i < s.size(); i++) {
            char want = opener[(unsigned char)s[i]];
            if (!want) {
                st.push_back((int)i);
                depth = max(depth, st.size());
            } else if (!st.empty() && s[st.back()] == want) {
                st.pop_back();
            } else {
                mismatch = (long long)i + 1;
                break;
            }
        }
        if (mismatch >= 0) out += "MISMATCH " + to_string(mismatch) + "\n";
        else if (!st.empty()) out += "UNCLOSED " + to_string(st.front() + 1) + "\n";
        else out += "OK " + to_string(depth) + "\n";
    }
    cout << out;
    return 0;
}
