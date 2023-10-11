# frozen_string_literal: true

require 'rails_helper'

describe 'visitor signing in' do
  it 'allows a visitor with a valid username and password' do
    sign_in_with 'valid_username', 'password', create: true

    expect(page).to have_content('Welcome!')
  end

  it 'rejects a visitor with an invalid username' do
    sign_in_with 'invalid_username', 'password'

    expect(page).to have_field('user_username', with: 'invalid_username')
  end

  it 'rejects a visitor with blank password' do
    sign_in_with 'valid_username', ''

    expect(page).to have_field('user_username', with: 'valid_username')
  end
end
